"""
Automation Service for DMSCode
Executes workflows defined in .dmsflow files based on triggers.
Supports: Cron scheduling, Conditions, LLM decisions, Webhooks
"""
import os
import re
import logging
import json
import asyncio
from enum import Enum
from typing import List, Dict, Any, Optional, Union, Callable
from datetime import datetime
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import httpx

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Environment variables
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "ollama")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434")
GRAPH_SERVICE_URL = os.getenv("GRAPH_SERVICE_URL", "http://graph-service:8530")

# Scheduler for Cron triggers
scheduler_tasks: Dict[str, asyncio.Task] = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage scheduler lifecycle"""
    logger.info("Starting Automation Service with scheduler support")
    yield
    # Cancel all scheduled tasks on shutdown
    for task_id, task in scheduler_tasks.items():
        task.cancel()
        logger.info(f"Cancelled scheduled task: {task_id}")

app = FastAPI(title="DMSCode Automation Service", version="0.2.0", lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class TriggerType(str, Enum):
    ON_IMPORT = "on_import"
    ON_TAG_ADDED = "on_tag_added"
    ON_ENTITY_EXTRACTED = "on_entity_extracted"
    ON_OCR_COMPLETE = "on_ocr_complete"
    SCHEDULE = "schedule"
    MANUAL = "manual"

class ActionType(str, Enum):
    ADD_TAG = "add_tag"
    REMOVE_TAG = "remove_tag"
    MOVE_FILE = "move_file"
    COPY_FILE = "copy_file"
    DELETE_FILE = "delete_file"
    WEBHOOK = "webhook"
    SEND_EMAIL = "send_email"
    ASK_LLM = "ask_llm"
    EXTRACT_ENTITIES = "extract_entities"
    CREATE_CALENDAR_EVENT = "create_calendar_event"

class ConditionOperator(str, Enum):
    EQUALS = "equals"
    NOT_EQUALS = "not_equals"
    CONTAINS = "contains"
    NOT_CONTAINS = "not_contains"
    GREATER_THAN = "greater_than"
    LESS_THAN = "less_than"
    REGEX_MATCH = "regex_match"
    TAG_EXISTS = "tag_exists"
    ENTITY_TYPE_EXISTS = "entity_type_exists"

class NodeType(str, Enum):
    TRIGGER = "trigger"
    CONDITION = "condition"
    ACTION = "action"
    LLM_DECISION = "llm_decision"

class FlowNode(BaseModel):
    id: str
    type: NodeType
    data: Dict[str, Any]
    position: Dict[str, float]

class FlowEdge(BaseModel):
    id: str
    source: str
    target: str
    sourceHandle: Optional[str] = None
    targetHandle: Optional[str] = None

class DmsFlow(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    active: bool = True
    trigger: TriggerType
    nodes: List[FlowNode]
    edges: List[FlowEdge]
    created_at: datetime = Field(default_factory=datetime.now)

class ExecutionContext(BaseModel):
    doc_id: Optional[str] = None
    file_path: Optional[str] = None
    text: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    tags: List[str] = Field(default_factory=list)
    entities: List[Dict[str, Any]] = Field(default_factory=list)
    llm_results: Dict[str, str] = Field(default_factory=dict)  # Store LLM responses by node_id
    
class ExecutionResult(BaseModel):
    flow_id: str
    status: str # "success", "failed", "skipped"
    steps_executed: List[str]
    error: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.now)

class ConditionConfig(BaseModel):
    field: str  # e.g., "metadata.amount", "text", "tags", "entity.type"
    operator: ConditionOperator
    value: Any
    
class CronSchedule(BaseModel):
    expression: str  # Cron expression like "0 9 * * 1-5" (weekdays at 9am)
    timezone: str = "Europe/Berlin"

# In-memory storage for flows (mock database)
flows_db: Dict[str, DmsFlow] = {}

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "automation"}

@app.post("/flows")
async def create_flow(flow: DmsFlow):
    flows_db[flow.id] = flow
    logger.info(f"Created flow: {flow.name} ({flow.id})")
    return flow

@app.get("/flows")
async def list_flows():
    return list(flows_db.values())

@app.get("/flows/{flow_id}")
async def get_flow(flow_id: str):
    if flow_id not in flows_db:
        raise HTTPException(status_code=404, detail="Flow not found")
    return flows_db[flow_id]

@app.put("/flows/{flow_id}")
async def update_flow(flow_id: str, flow: DmsFlow):
    if flow_id not in flows_db:
        raise HTTPException(status_code=404, detail="Flow not found")
    flows_db[flow_id] = flow
    return flow

@app.post("/execute/{trigger_type}")
async def execute_trigger(trigger_type: TriggerType, context: ExecutionContext, background_tasks: BackgroundTasks):
    """
    Trigger executions for all active flows matching the trigger type.
    """
    matching_flows = [f for f in flows_db.values() if f.active and f.trigger == trigger_type]
    
    if not matching_flows:
        return {"message": "No active flows for this trigger", "executed_count": 0}
    
    # Run in background to not block the caller
    background_tasks.add_task(run_flows, matching_flows, context)
    
    return {
        "message": f"Triggered {len(matching_flows)} flows",
        "flow_ids": [f.id for f in matching_flows]
    }

async def run_flows(flows: List[DmsFlow], context: ExecutionContext):
    results = []
    for flow in flows:
        try:
            result = await execute_single_flow(flow, context)
            results.append(result)
        except Exception as e:
            logger.error(f"Error executing flow {flow.id}: {e}")
            results.append(ExecutionResult(
                flow_id=flow.id,
                status="failed",
                steps_executed=[],
                error=str(e)
            ))
    return results

async def execute_single_flow(flow: DmsFlow, context: ExecutionContext) -> ExecutionResult:
    logger.info(f"Executing flow {flow.name} for doc {context.doc_id}")
    
    steps_executed = []
    
    # 1. Find Start Node (Trigger)
    start_node = next((n for n in flow.nodes if n.type == NodeType.TRIGGER), None)
    if not start_node:
        logger.error(f"Flow {flow.id} has no trigger node")
        return ExecutionResult(flow_id=flow.id, status="failed", steps_executed=[], error="No trigger node")

    # 2. BFS Traversal with condition handling
    current_nodes = [start_node]
    visited = set()

    while current_nodes:
        node = current_nodes.pop(0)
        if node.id in visited:
            continue
        visited.add(node.id)
        steps_executed.append(node.id)

        # Execute Node Logic
        try:
            result = await process_node(node, context)
        except Exception as e:
            logger.error(f"Node execution failed {node.id}: {e}")
            return ExecutionResult(
                flow_id=flow.id, 
                status="failed", 
                steps_executed=steps_executed, 
                error=str(e)
            )

        # Find next nodes based on edges
        outgoing_edges = [e for e in flow.edges if e.source == node.id]
        
        for edge in outgoing_edges:
            # For condition/LLM nodes, check if edge matches the result
            if node.type in [NodeType.CONDITION, NodeType.LLM_DECISION]:
                # result is True/False for conditions, or option string for LLM
                edge_handle = edge.sourceHandle or ""
                
                if node.type == NodeType.CONDITION:
                    # Condition: "true" or "false" handles
                    if (result and edge_handle == "true") or (not result and edge_handle == "false"):
                        target_node = next((n for n in flow.nodes if n.id == edge.target), None)
                        if target_node:
                            current_nodes.append(target_node)
                else:
                    # LLM Decision: handle matches option
                    if edge_handle.lower() == str(result).lower():
                        target_node = next((n for n in flow.nodes if n.id == edge.target), None)
                        if target_node:
                            current_nodes.append(target_node)
            else:
                # Trigger/Action: follow all edges
                target_node = next((n for n in flow.nodes if n.id == edge.target), None)
                if target_node:
                    current_nodes.append(target_node)

    return ExecutionResult(flow_id=flow.id, status="success", steps_executed=steps_executed)

async def process_node(node: FlowNode, context: ExecutionContext):
    ctype = node.type
    label = node.data.get("label", "Unknown")
    
    logger.info(f"Processing Node: [{ctype.upper()}] {label}")

    if ctype == NodeType.ACTION:
        await execute_action(node, context)
        
    elif ctype == NodeType.CONDITION:
        return await evaluate_condition(node, context)
    
    elif ctype == NodeType.LLM_DECISION:
        return await execute_llm_decision(node, context)
    
    return True  # Continue flow by default


async def execute_action(node: FlowNode, context: ExecutionContext):
    """Execute an action node"""
    action_type = node.data.get("action_type", "")
    logger.info(f" >>> ACTION: {action_type} on {context.doc_id}")
    
    if action_type == ActionType.ADD_TAG.value:
        tag = node.data.get("tag", "")
        context.tags.append(tag)
        logger.info(f"     Added tag: {tag}")
        # TODO: Call DMS API to persist tag
        
    elif action_type == ActionType.REMOVE_TAG.value:
        tag = node.data.get("tag", "")
        if tag in context.tags:
            context.tags.remove(tag)
        logger.info(f"     Removed tag: {tag}")
        
    elif action_type == ActionType.WEBHOOK.value:
        url = node.data.get("webhook_url", "")
        payload = {
            "doc_id": context.doc_id,
            "file_path": context.file_path,
            "metadata": context.metadata,
            "tags": context.tags,
            "timestamp": datetime.now().isoformat()
        }
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, json=payload)
                logger.info(f"     Webhook sent to {url}: {response.status_code}")
        except Exception as e:
            logger.error(f"     Webhook failed: {e}")
            
    elif action_type == ActionType.ASK_LLM.value:
        prompt = node.data.get("prompt", "")
        # Interpolate context variables in prompt
        prompt = prompt.replace("{doc_id}", context.doc_id or "")
        prompt = prompt.replace("{text}", (context.text or "")[:2000])
        prompt = prompt.replace("{tags}", ", ".join(context.tags))
        
        result = await call_llm(prompt)
        context.llm_results[node.id] = result
        logger.info(f"     LLM Response: {result[:100]}...")
        
    elif action_type == ActionType.EXTRACT_ENTITIES.value:
        # Call graph service for entity extraction
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{GRAPH_SERVICE_URL}/extract",
                    json={
                        "doc_id": context.doc_id,
                        "text": context.text or "",
                        "metadata": context.metadata
                    }
                )
                if response.status_code == 200:
                    result = response.json()
                    context.entities = result.get("entities", [])
                    logger.info(f"     Extracted {len(context.entities)} entities")
        except Exception as e:
            logger.error(f"     Entity extraction failed: {e}")


async def evaluate_condition(node: FlowNode, context: ExecutionContext) -> bool:
    """Evaluate a condition node and return True/False"""
    field = node.data.get("field", "")
    operator = node.data.get("operator", ConditionOperator.EQUALS.value)
    expected_value = node.data.get("value", "")
    
    # Get actual value from context
    actual_value = get_nested_value(context, field)
    
    logger.info(f" >>> CONDITION: {field} {operator} {expected_value}")
    logger.info(f"     Actual value: {actual_value}")
    
    result = False
    
    if operator == ConditionOperator.EQUALS.value:
        result = str(actual_value) == str(expected_value)
    elif operator == ConditionOperator.NOT_EQUALS.value:
        result = str(actual_value) != str(expected_value)
    elif operator == ConditionOperator.CONTAINS.value:
        result = str(expected_value).lower() in str(actual_value).lower()
    elif operator == ConditionOperator.NOT_CONTAINS.value:
        result = str(expected_value).lower() not in str(actual_value).lower()
    elif operator == ConditionOperator.GREATER_THAN.value:
        try:
            result = float(actual_value) > float(expected_value)
        except (ValueError, TypeError):
            result = False
    elif operator == ConditionOperator.LESS_THAN.value:
        try:
            result = float(actual_value) < float(expected_value)
        except (ValueError, TypeError):
            result = False
    elif operator == ConditionOperator.REGEX_MATCH.value:
        try:
            result = bool(re.search(expected_value, str(actual_value), re.IGNORECASE))
        except re.error:
            result = False
    elif operator == ConditionOperator.TAG_EXISTS.value:
        result = expected_value in context.tags
    elif operator == ConditionOperator.ENTITY_TYPE_EXISTS.value:
        result = any(e.get("type") == expected_value for e in context.entities)
    
    logger.info(f"     Result: {result}")
    return result


def get_nested_value(context: ExecutionContext, field: str) -> Any:
    """Get a nested value from context using dot notation"""
    parts = field.split(".")
    
    # Start with context as dict
    obj = context.model_dump()
    
    for part in parts:
        if isinstance(obj, dict):
            obj = obj.get(part, "")
        elif isinstance(obj, list) and part.isdigit():
            idx = int(part)
            obj = obj[idx] if idx < len(obj) else ""
        else:
            return ""
    
    return obj


async def execute_llm_decision(node: FlowNode, context: ExecutionContext) -> str:
    """Use LLM to make a decision - returns the handle to follow (e.g., 'yes', 'no', 'urgent')"""
    question = node.data.get("question", "")
    options = node.data.get("options", ["yes", "no"])  # Possible outputs
    
    # Build prompt
    prompt = f"""Based on the following document information, answer the question.
    
Document ID: {context.doc_id}
Text (excerpt): {(context.text or "")[:1500]}
Tags: {", ".join(context.tags)}
Metadata: {json.dumps(context.metadata)}

Question: {question}

Respond with EXACTLY one of these options: {", ".join(options)}
Only respond with the option, nothing else."""

    result = await call_llm(prompt)
    result = result.strip().lower()
    
    # Find best matching option
    for option in options:
        if option.lower() in result:
            logger.info(f" >>> LLM DECISION: {question} -> {option}")
            return option
    
    # Default to first option
    logger.warning(f" >>> LLM DECISION unclear '{result}', defaulting to {options[0]}")
    return options[0]


async def call_llm(prompt: str) -> str:
    """Call LLM provider (Anthropic, OpenAI, or Ollama)"""
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            if LLM_PROVIDER == "anthropic" and ANTHROPIC_API_KEY:
                response = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": ANTHROPIC_API_KEY,
                        "anthropic-version": "2023-06-01",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": os.getenv("ANTHROPIC_MODEL", "claude-3-haiku-20240307"),
                        "max_tokens": 1024,
                        "messages": [{"role": "user", "content": prompt}]
                    }
                )
                response.raise_for_status()
                return response.json()["content"][0]["text"]
                
            elif LLM_PROVIDER == "openai" and OPENAI_API_KEY:
                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                    json={
                        "model": "gpt-4o-mini",
                        "messages": [{"role": "user", "content": prompt}]
                    }
                )
                response.raise_for_status()
                return response.json()["choices"][0]["message"]["content"]
                
            else:
                # Ollama
                response = await client.post(
                    f"{OLLAMA_URL}/api/generate",
                    json={"model": "llama3.2:3b", "prompt": prompt, "stream": False}
                )
                response.raise_for_status()
                return response.json().get("response", "")
                
    except Exception as e:
        logger.error(f"LLM call failed: {e}")
        return ""


# ===== Cron Scheduler =====

def parse_cron(expression: str) -> Dict[str, Any]:
    """Parse simple cron expression (minute hour day month weekday)"""
    parts = expression.split()
    if len(parts) != 5:
        raise ValueError(f"Invalid cron expression: {expression}")
    return {
        "minute": parts[0],
        "hour": parts[1],
        "day": parts[2],
        "month": parts[3],
        "weekday": parts[4]
    }


def cron_matches_now(cron: Dict[str, Any]) -> bool:
    """Check if cron matches current time"""
    now = datetime.now()
    
    def matches(pattern: str, value: int) -> bool:
        if pattern == "*":
            return True
        if "-" in pattern:  # Range: 1-5
            start, end = map(int, pattern.split("-"))
            return start <= value <= end
        if "," in pattern:  # List: 1,3,5
            return value in map(int, pattern.split(","))
        if "/" in pattern:  # Step: */15
            base, step = pattern.split("/")
            step = int(step)
            return value % step == 0
        return value == int(pattern)
    
    return (
        matches(cron["minute"], now.minute) and
        matches(cron["hour"], now.hour) and
        matches(cron["day"], now.day) and
        matches(cron["month"], now.month) and
        matches(cron["weekday"], now.isoweekday() % 7)  # 0=Sunday
    )


async def scheduler_loop():
    """Background task that checks cron triggers every minute"""
    while True:
        try:
            # Find all scheduled flows
            scheduled_flows = [f for f in flows_db.values() 
                              if f.active and f.trigger == TriggerType.SCHEDULE]
            
            for flow in scheduled_flows:
                # Get cron from trigger node
                trigger_node = next((n for n in flow.nodes if n.type == NodeType.TRIGGER), None)
                if not trigger_node:
                    continue
                    
                cron_expr = trigger_node.data.get("cron", "")
                if not cron_expr:
                    continue
                
                try:
                    cron = parse_cron(cron_expr)
                    if cron_matches_now(cron):
                        logger.info(f"⏰ Cron trigger matched for flow: {flow.name}")
                        # Execute with empty context
                        context = ExecutionContext(doc_id=f"scheduled-{datetime.now().isoformat()}")
                        await execute_single_flow(flow, context)
                except Exception as e:
                    logger.error(f"Cron check failed for {flow.id}: {e}")
                    
        except Exception as e:
            logger.error(f"Scheduler error: {e}")
        
        # Wait until next minute
        await asyncio.sleep(60)


@app.on_event("startup")
async def start_scheduler():
    """Start the cron scheduler background task"""
    task = asyncio.create_task(scheduler_loop())
    scheduler_tasks["main"] = task
    logger.info("✓ Cron scheduler started")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8540)
