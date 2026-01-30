"""
Automation Service for DMSCode
Executes workflows defined in .dmsflow files based on triggers.
"""
import os
import logging
import json
from enum import Enum
from typing import List, Dict, Any, Optional, Union
from datetime import datetime

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="DMSCode Automation Service", version="0.1.0")

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
    SCHEDULE = "schedule"
    MANUAL = "manual"

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
    
class ExecutionResult(BaseModel):
    flow_id: str
    status: str # "success", "failed", "skipped"
    steps_executed: List[str]
    error: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.now)

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
    for flow in flows:
        try:
            await execute_single_flow(flow, context)
        except Exception as e:
            logger.error(f"Error executing flow {flow.id}: {e}")

async def execute_single_flow(flow: DmsFlow, context: ExecutionContext):
    logger.info(f"Executing flow {flow.name} for doc {context.doc_id}")
    
    # 1. Find Start Node (Trigger)
    start_node = next((n for n in flow.nodes if n.type == NodeType.TRIGGER), None)
    if not start_node:
        logger.error(f"Flow {flow.id} has no trigger node")
        return

    # 2. Mock Traversal (Depth First for simplicity)
    current_nodes = [start_node]
    visited = set()

    while current_nodes:
        node = current_nodes.pop(0) # BFS
        if node.id in visited:
            continue
        visited.add(node.id)

        # Execute Node Logic
        try:
            await process_node(node, context)
        except Exception as e:
            logger.error(f"Node execution failed {node.id}: {e}")
            break # Stop flow on error

        # Find next nodes
        # Get edges starting from current node
        outgoing_edges = [e for e in flow.edges if e.source == node.id]
        
        # Determine which edges to follow based on Condition results (TODO)
        # For now, follow all
        for edge in outgoing_edges:
            target_node = next((n for n in flow.nodes if n.id == edge.target), None)
            if target_node:
                current_nodes.append(target_node)

async def process_node(node: FlowNode, context: ExecutionContext):
    ctype = node.type
    label = node.data.get("label", "Unknown")
    
    logger.info(f"Processing Node: [{ctype.upper()}] {label}")

    if ctype == NodeType.ACTION:
        # Simulate Action
        logger.info(f" >>> ACTION PERFORMED: {label} on {context.doc_id}")
        
    elif ctype == NodeType.CONDITION:
        # Simulate Check
        val = node.data.get("value", 0)
        logger.info(f" >>> CHECKING CONDITION: {label}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8540)
