'use client';

import { useState, useEffect } from 'react';
import { 
  FileText, 
  Download, 
  Trash2, 
  Eye, 
  Tag, 
  Calendar,
  Filter,
  Grid,
  List,
  RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface StorageObject {
  name: string;
  size: number;
  content_type: string;
  last_modified: string;
  etag: string;
}

export function DocumentList() {
  const [documents, setDocuments] = useState<StorageObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchFilter, setSearchFilter] = useState('');

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/storage/objects');
      if (!response.ok) throw new Error('Fehler beim Laden der Dokumente');
      const data = await response.json();
      setDocuments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  };

  const downloadDocument = async (objectName: string) => {
    try {
      const response = await fetch(`/api/storage/objects/${encodeURIComponent(objectName)}/url`);
      if (response.ok) {
        const data = await response.json();
        window.open(data.url, '_blank');
      }
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const deleteDocument = async (objectName: string) => {
    if (!confirm(`Dokument "${objectName}" wirklich löschen?`)) return;
    
    try {
      const response = await fetch(`/api/storage/objects/${encodeURIComponent(objectName)}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        setDocuments(documents.filter(d => d.name !== objectName));
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileIcon = (contentType: string) => {
    if (contentType.includes('pdf')) return '📄';
    if (contentType.includes('image')) return '🖼️';
    if (contentType.includes('word') || contentType.includes('document')) return '📝';
    if (contentType.includes('sheet') || contentType.includes('excel')) return '📊';
    return '📁';
  };

  const filteredDocuments = documents.filter(doc => 
    doc.name.toLowerCase().includes(searchFilter.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-dms-primary animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 text-red-700 p-4 rounded-lg">
          <p className="font-medium">Fehler beim Laden</p>
          <p className="text-sm mt-1">{error}</p>
          <button 
            onClick={fetchDocuments}
            className="mt-2 text-sm underline hover:no-underline"
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dms-dark">Dokumente</h1>
          <p className="text-dms-secondary">{documents.length} Dokumente</p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 md:w-64">
            <input
              type="text"
              placeholder="Suchen..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-dms-primary focus:border-transparent"
            />
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>

          {/* View Toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded ${viewMode === 'grid' ? 'bg-white shadow-sm' : ''}`}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded ${viewMode === 'list' ? 'bg-white shadow-sm' : ''}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Refresh */}
          <button
            onClick={fetchDocuments}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <RefreshCw className="w-5 h-5 text-dms-secondary" />
          </button>
        </div>
      </div>

      {/* Empty State */}
      {filteredDocuments.length === 0 && (
        <div className="text-center py-12">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-dms-dark">Keine Dokumente</h3>
          <p className="text-dms-secondary mt-1">
            {searchFilter ? 'Keine Treffer für Ihre Suche' : 'Laden Sie Ihr erstes Dokument hoch'}
          </p>
        </div>
      )}

      {/* Document Grid */}
      {viewMode === 'grid' && filteredDocuments.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredDocuments.map((doc) => (
            <div
              key={doc.etag}
              className="bg-white rounded-xl p-4 shadow-sm card-hover group"
            >
              {/* Icon */}
              <div className="text-4xl mb-3">{getFileIcon(doc.content_type)}</div>
              
              {/* Name */}
              <h3 className="font-medium text-dms-dark truncate" title={doc.name}>
                {doc.name.split('/').pop()}
              </h3>
              
              {/* Meta */}
              <div className="flex items-center gap-2 mt-2 text-xs text-dms-secondary">
                <span>{formatBytes(doc.size)}</span>
                <span>•</span>
                <span>{format(new Date(doc.last_modified), 'dd.MM.yy', { locale: de })}</span>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => downloadDocument(doc.name)}
                  className="flex-1 flex items-center justify-center gap-1 py-2 bg-dms-primary text-white text-sm rounded-lg hover:bg-blue-700"
                >
                  <Download className="w-4 h-4" />
                  <span>Öffnen</span>
                </button>
                <button
                  onClick={() => deleteDocument(doc.name)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Document List */}
      {viewMode === 'list' && filteredDocuments.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-dms-secondary">Name</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-dms-secondary hidden md:table-cell">Typ</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-dms-secondary hidden sm:table-cell">Größe</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-dms-secondary hidden lg:table-cell">Datum</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-dms-secondary">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredDocuments.map((doc) => (
                <tr key={doc.etag} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{getFileIcon(doc.content_type)}</span>
                      <span className="font-medium text-dms-dark truncate max-w-xs">
                        {doc.name.split('/').pop()}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-dms-secondary hidden md:table-cell">
                    {doc.content_type.split('/').pop()}
                  </td>
                  <td className="px-4 py-3 text-sm text-dms-secondary hidden sm:table-cell">
                    {formatBytes(doc.size)}
                  </td>
                  <td className="px-4 py-3 text-sm text-dms-secondary hidden lg:table-cell">
                    {format(new Date(doc.last_modified), 'dd.MM.yyyy HH:mm', { locale: de })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => downloadDocument(doc.name)}
                        className="p-2 hover:bg-gray-100 rounded-lg text-dms-primary"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteDocument(doc.name)}
                        className="p-2 hover:bg-red-50 rounded-lg text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
