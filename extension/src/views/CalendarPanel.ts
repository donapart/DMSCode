import * as vscode from 'vscode';
import { DmsService } from '../services/DmsService';

export interface CalendarEvent {
    id: string;
    title: string;
    date: Date;
    type: 'document' | 'reminder' | 'deadline';
    documentPath?: string;
    description?: string;
}

interface CalendarMessage {
    command: string;
    event?: Omit<CalendarEvent, 'id'>;
    id?: string;
    path?: string;
}

export class CalendarPanel {
    public static currentPanel: CalendarPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _disposables: vscode.Disposable[] = [];
    private events: CalendarEvent[] = [];

    public static createOrShow(extensionUri: vscode.Uri, dmsService: DmsService) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (CalendarPanel.currentPanel) {
            CalendarPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'dmsCalendar',
            'DMS Kalender',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        CalendarPanel.currentPanel = new CalendarPanel(panel, extensionUri, dmsService);
    }

    private constructor(
        panel: vscode.WebviewPanel,
        private readonly extensionUri: vscode.Uri,
        private readonly dmsService: DmsService
    ) {
        this._panel = panel;
        // Initialize asynchronously
        void this._initialize();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message: CalendarMessage) => {
                switch (message.command) {
                    case 'addEvent':
                        if (message.event) {
                            await this.addEvent(message.event);
                        }
                        break;
                    case 'deleteEvent':
                        if (message.id) {
                            await this.deleteEvent(message.id);
                        }
                        break;
                    case 'openDocument':
                        if (message.path) {
                            vscode.commands.executeCommand('vscode.open', vscode.Uri.file(message.path));
                        }
                        break;
                    case 'getEvents':
                        this._panel.webview.postMessage({ 
                            command: 'events', 
                            events: this.events 
                        });
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    private async _initialize(): Promise<void> {
        await this._loadEvents();
        this._update();
    }

    private async _loadEvents(): Promise<void> {
        // Load events from global state
        const stored = this.dmsService.context.globalState.get<CalendarEvent[]>('calendarEvents', []);
        this.events = stored.map((e: CalendarEvent) => ({
            ...e,
            date: new Date(e.date)
        }));

        // Add document dates as events
        const documents = await this.dmsService.getDocuments();
        const docEvents: CalendarEvent[] = documents.slice(0, 50).map(doc => ({
            id: `doc-${doc.id}`,
            title: doc.name,
            date: new Date(doc.createdAt),
            type: 'document' as const,
            documentPath: doc.path
        }));

        // Merge, avoiding duplicates
        const existingIds = new Set(this.events.map(e => e.id));
        for (const docEvent of docEvents) {
            if (!existingIds.has(docEvent.id)) {
                this.events.push(docEvent);
            }
        }
    }

    private async addEvent(event: Omit<CalendarEvent, 'id'>): Promise<void> {
        const newEvent: CalendarEvent = {
            ...event,
            id: `evt-${Date.now()}`,
            date: new Date(event.date)
        };
        this.events.push(newEvent);
        await this._saveEvents();
        this._panel.webview.postMessage({ command: 'events', events: this.events });
    }

    private async deleteEvent(id: string): Promise<void> {
        this.events = this.events.filter(e => e.id !== id);
        await this._saveEvents();
        this._panel.webview.postMessage({ command: 'events', events: this.events });
    }

    private async _saveEvents(): Promise<void> {
        // Only save user-created events (not document events)
        const userEvents = this.events.filter(e => !e.id.startsWith('doc-'));
        await this.dmsService.context.globalState.update('calendarEvents', userEvents);
    }

    private _update() {
        this._panel.webview.html = this._getHtmlForWebview();
    }

    private _getHtmlForWebview(): string {
        return `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DMS Kalender</title>
    <style>
        :root {
            --bg: var(--vscode-editor-background);
            --fg: var(--vscode-editor-foreground);
            --border: var(--vscode-widget-border);
            --card-bg: var(--vscode-editorWidget-background);
            --accent: var(--vscode-button-background);
            --hover: var(--vscode-list-hoverBackground);
        }
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            background: var(--bg);
            color: var(--fg);
            margin: 0;
        }
        h1 {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 20px;
        }
        .calendar-container {
            display: grid;
            grid-template-columns: 1fr 300px;
            gap: 20px;
            height: calc(100vh - 100px);
        }
        .calendar {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 16px;
        }
        .calendar-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }
        .calendar-header h2 {
            margin: 0;
            font-size: 18px;
        }
        .calendar-nav {
            display: flex;
            gap: 8px;
        }
        .calendar-nav button {
            background: var(--vscode-button-secondaryBackground);
            color: var(--fg);
            border: 1px solid var(--border);
            padding: 4px 12px;
            border-radius: 4px;
            cursor: pointer;
        }
        .calendar-nav button:hover {
            background: var(--hover);
        }
        .weekdays {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 4px;
            margin-bottom: 8px;
        }
        .weekday {
            text-align: center;
            font-size: 12px;
            font-weight: 600;
            opacity: 0.7;
            padding: 8px;
        }
        .days {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 4px;
        }
        .day {
            aspect-ratio: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 4px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            min-height: 60px;
        }
        .day:hover {
            background: var(--hover);
        }
        .day.other-month {
            opacity: 0.3;
        }
        .day.today {
            background: var(--accent);
            color: var(--vscode-button-foreground);
        }
        .day.selected {
            border: 2px solid var(--accent);
        }
        .day-number {
            font-weight: 600;
            margin-bottom: 4px;
        }
        .day-events {
            display: flex;
            flex-wrap: wrap;
            gap: 2px;
            justify-content: center;
        }
        .event-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
        }
        .event-dot.document { background: #4CAF50; }
        .event-dot.reminder { background: #2196F3; }
        .event-dot.deadline { background: #f44336; }
        
        .sidebar {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        .events-panel {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 16px;
            flex: 1;
            overflow: auto;
        }
        .events-panel h3 {
            margin: 0 0 12px 0;
            font-size: 14px;
        }
        .event-item {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 8px;
            cursor: pointer;
            background: var(--bg);
            border: 1px solid var(--border);
        }
        .event-item:hover {
            border-color: var(--accent);
        }
        .event-icon {
            font-size: 16px;
        }
        .event-info {
            flex: 1;
            min-width: 0;
        }
        .event-title {
            font-weight: 500;
            font-size: 13px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .event-date {
            font-size: 11px;
            opacity: 0.7;
        }
        .event-delete {
            opacity: 0;
            background: none;
            border: none;
            color: var(--fg);
            cursor: pointer;
            padding: 2px 6px;
        }
        .event-item:hover .event-delete {
            opacity: 0.5;
        }
        .event-delete:hover {
            opacity: 1 !important;
            color: #f44336;
        }
        
        .add-panel {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 16px;
        }
        .add-panel h3 {
            margin: 0 0 12px 0;
            font-size: 14px;
        }
        .form-group {
            margin-bottom: 12px;
        }
        .form-group label {
            display: block;
            font-size: 12px;
            margin-bottom: 4px;
            opacity: 0.8;
        }
        .form-group input, .form-group select {
            width: 100%;
            box-sizing: border-box;
            background: var(--vscode-input-background);
            border: 1px solid var(--border);
            color: var(--fg);
            padding: 8px;
            border-radius: 4px;
            font-size: 13px;
        }
        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            width: 100%;
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .no-events {
            text-align: center;
            padding: 20px;
            opacity: 0.5;
            font-size: 13px;
        }
    </style>
</head>
<body>
    <h1>📅 DMS Kalender</h1>
    
    <div class="calendar-container">
        <div class="calendar">
            <div class="calendar-header">
                <h2 id="monthYear"></h2>
                <div class="calendar-nav">
                    <button onclick="prevMonth()">◀</button>
                    <button onclick="today()">Heute</button>
                    <button onclick="nextMonth()">▶</button>
                </div>
            </div>
            <div class="weekdays">
                <div class="weekday">Mo</div>
                <div class="weekday">Di</div>
                <div class="weekday">Mi</div>
                <div class="weekday">Do</div>
                <div class="weekday">Fr</div>
                <div class="weekday">Sa</div>
                <div class="weekday">So</div>
            </div>
            <div class="days" id="daysGrid"></div>
        </div>
        
        <div class="sidebar">
            <div class="events-panel">
                <h3 id="eventsTitle">Ereignisse</h3>
                <div id="eventsList"></div>
            </div>
            
            <div class="add-panel">
                <h3>➕ Neues Ereignis</h3>
                <div class="form-group">
                    <label>Titel</label>
                    <input type="text" id="eventTitle" placeholder="Ereignis-Titel">
                </div>
                <div class="form-group">
                    <label>Datum</label>
                    <input type="date" id="eventDate">
                </div>
                <div class="form-group">
                    <label>Typ</label>
                    <select id="eventType">
                        <option value="reminder">🔔 Erinnerung</option>
                        <option value="deadline">⏰ Frist</option>
                    </select>
                </div>
                <button onclick="addEvent()">Hinzufügen</button>
            </div>
        </div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        let currentDate = new Date();
        let selectedDate = new Date();
        let events = [];
        
        const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
                           'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
        
        function init() {
            document.getElementById('eventDate').value = formatDateInput(new Date());
            vscode.postMessage({ command: 'getEvents' });
            renderCalendar();
        }
        
        function formatDateInput(date) {
            return date.toISOString().split('T')[0];
        }
        
        function formatDate(date) {
            return new Date(date).toLocaleDateString('de-DE', { 
                day: '2-digit', 
                month: '2-digit', 
                year: 'numeric' 
            });
        }
        
        function isSameDay(d1, d2) {
            const date1 = new Date(d1);
            const date2 = new Date(d2);
            return date1.getFullYear() === date2.getFullYear() &&
                   date1.getMonth() === date2.getMonth() &&
                   date1.getDate() === date2.getDate();
        }
        
        function renderCalendar() {
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            
            document.getElementById('monthYear').textContent = monthNames[month] + ' ' + year;
            
            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            const startDay = (firstDay.getDay() + 6) % 7; // Monday = 0
            
            const grid = document.getElementById('daysGrid');
            grid.innerHTML = '';
            
            // Previous month days
            const prevMonth = new Date(year, month, 0);
            for (let i = startDay - 1; i >= 0; i--) {
                const day = prevMonth.getDate() - i;
                const date = new Date(year, month - 1, day);
                grid.appendChild(createDayElement(day, date, true));
            }
            
            // Current month days
            for (let day = 1; day <= lastDay.getDate(); day++) {
                const date = new Date(year, month, day);
                grid.appendChild(createDayElement(day, date, false));
            }
            
            // Next month days
            const remaining = 42 - grid.children.length;
            for (let day = 1; day <= remaining; day++) {
                const date = new Date(year, month + 1, day);
                grid.appendChild(createDayElement(day, date, true));
            }
        }
        
        function createDayElement(day, date, otherMonth) {
            const div = document.createElement('div');
            div.className = 'day' + (otherMonth ? ' other-month' : '');
            
            const today = new Date();
            if (isSameDay(date, today)) {
                div.classList.add('today');
            }
            if (isSameDay(date, selectedDate)) {
                div.classList.add('selected');
            }
            
            const dayEvents = events.filter(e => isSameDay(e.date, date));
            
            div.innerHTML = '<div class="day-number">' + day + '</div>' +
                '<div class="day-events">' +
                dayEvents.slice(0, 3).map(e => 
                    '<div class="event-dot ' + e.type + '"></div>'
                ).join('') +
                '</div>';
            
            div.onclick = () => selectDay(date);
            return div;
        }
        
        function selectDay(date) {
            selectedDate = date;
            document.getElementById('eventDate').value = formatDateInput(date);
            renderCalendar();
            renderEvents();
        }
        
        function renderEvents() {
            const dayEvents = events.filter(e => isSameDay(e.date, selectedDate));
            const list = document.getElementById('eventsList');
            const title = document.getElementById('eventsTitle');
            
            title.textContent = 'Ereignisse am ' + formatDate(selectedDate);
            
            if (dayEvents.length === 0) {
                list.innerHTML = '<div class="no-events">Keine Ereignisse</div>';
                return;
            }
            
            list.innerHTML = dayEvents.map(e => {
                const icon = e.type === 'document' ? '📄' : e.type === 'deadline' ? '⏰' : '🔔';
                const canDelete = !e.id.startsWith('doc-');
                return '<div class="event-item" onclick="openEvent(\\'' + (e.documentPath || '').replace(/\\\\/g, '\\\\\\\\') + '\\')">' +
                    '<span class="event-icon">' + icon + '</span>' +
                    '<div class="event-info">' +
                        '<div class="event-title">' + e.title + '</div>' +
                        '<div class="event-date">' + e.type + '</div>' +
                    '</div>' +
                    (canDelete ? '<button class="event-delete" onclick="event.stopPropagation();deleteEvent(\\'' + e.id + '\\')">✕</button>' : '') +
                '</div>';
            }).join('');
        }
        
        function openEvent(path) {
            if (path) {
                vscode.postMessage({ command: 'openDocument', path });
            }
        }
        
        function deleteEvent(id) {
            vscode.postMessage({ command: 'deleteEvent', id });
        }
        
        function addEvent() {
            const title = document.getElementById('eventTitle').value.trim();
            const date = document.getElementById('eventDate').value;
            const type = document.getElementById('eventType').value;
            
            if (!title || !date) {
                return;
            }
            
            vscode.postMessage({
                command: 'addEvent',
                event: { title, date, type }
            });
            
            document.getElementById('eventTitle').value = '';
        }
        
        function prevMonth() {
            currentDate.setMonth(currentDate.getMonth() - 1);
            renderCalendar();
        }
        
        function nextMonth() {
            currentDate.setMonth(currentDate.getMonth() + 1);
            renderCalendar();
        }
        
        function today() {
            currentDate = new Date();
            selectedDate = new Date();
            renderCalendar();
            renderEvents();
        }
        
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'events') {
                events = message.events.map(e => ({
                    ...e,
                    date: new Date(e.date)
                }));
                renderCalendar();
                renderEvents();
            }
        });
        
        init();
    </script>
</body>
</html>`;
    }

    public dispose() {
        CalendarPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}
