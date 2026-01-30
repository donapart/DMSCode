'use client';

import { useState, useEffect } from 'react';
import { 
  FileText, 
  Search, 
  Upload, 
  Tag, 
  Calendar, 
  BarChart3, 
  Settings,
  Menu,
  X,
  Home,
  FolderOpen,
  Clock,
  Sparkles
} from 'lucide-react';
import { Dashboard } from '@/components/Dashboard';
import { DocumentList } from '@/components/DocumentList';
import { SearchPanel } from '@/components/SearchPanel';
import { UploadPanel } from '@/components/UploadPanel';

type View = 'dashboard' | 'documents' | 'search' | 'upload';

export default function HomePage() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [stats, setStats] = useState({
    totalDocuments: 0,
    recentDocuments: 0,
    totalTags: 0,
    storageUsed: '0 MB'
  });

  useEffect(() => {
    // Fetch stats on load
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      // Try to get documents from storage service
      const response = await fetch('/api/storage/objects');
      if (response.ok) {
        const objects = await response.json();
        const totalSize = objects.reduce((acc: number, obj: any) => acc + (obj.size || 0), 0);
        setStats({
          totalDocuments: objects.length,
          recentDocuments: objects.filter((o: any) => {
            const date = new Date(o.last_modified);
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            return date > weekAgo;
          }).length,
          totalTags: 0,
          storageUsed: formatBytes(totalSize)
        });
      }
    } catch (error) {
      console.log('Stats fetch failed, using defaults');
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'documents', label: 'Dokumente', icon: FolderOpen },
    { id: 'search', label: 'Suche', icon: Search },
    { id: 'upload', label: 'Upload', icon: Upload },
  ];

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard stats={stats} onNavigate={setCurrentView} />;
      case 'documents':
        return <DocumentList />;
      case 'search':
        return <SearchPanel />;
      case 'upload':
        return <UploadPanel onUploadComplete={fetchStats} />;
      default:
        return <Dashboard stats={stats} onNavigate={setCurrentView} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden bg-dms-dark text-white p-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <FileText className="w-6 h-6 text-dms-primary" />
          <span className="font-bold text-lg">DMSCode</span>
        </div>
        <button 
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 hover:bg-white/10 rounded-lg"
        >
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Sidebar */}
      <aside className={`
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0
        fixed md:static inset-y-0 left-0 z-50
        w-64 bg-dms-dark text-white
        transition-transform duration-300 ease-in-out
        flex flex-col
      `}>
        {/* Logo */}
        <div className="hidden md:flex items-center gap-3 p-6 border-b border-white/10">
          <FileText className="w-8 h-8 text-dms-primary" />
          <div>
            <h1 className="font-bold text-xl">DMSCode</h1>
            <p className="text-xs text-gray-400">Document Management</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2 mt-16 md:mt-0">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentView(item.id as View);
                  setSidebarOpen(false);
                }}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-lg
                  transition-all duration-200
                  ${isActive 
                    ? 'bg-dms-primary text-white' 
                    : 'text-gray-300 hover:bg-white/10 hover:text-white'
                  }
                `}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Sparkles className="w-4 h-4 text-dms-accent" />
            <span>Powered by AI</span>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {renderContent()}
      </main>
    </div>
  );
}
