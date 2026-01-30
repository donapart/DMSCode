"use client";

import { Search, Sparkles, Tag } from "lucide-react";
import { useState } from "react";

interface SearchResult {
  document: {
    id: string;
    name: string;
    path: string;
    tags: string[];
  };
  score: number;
  snippet: string;
}

export function SearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setSearched(true);

    try {
      const response = await fetch("/api/search/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, top_k: 10 }),
      });

      if (response.ok) {
        const data = await response.json();
        setResults(data.results || []);
      } else {
        setResults([]);
      }
    } catch (err) {
      console.error("Search failed:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const exampleQueries = [
    "Rechnungen von 2024",
    "Vertrag mit Kündigungsfrist",
    "Dokumente über 500€",
    "Steuererklärung",
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-dms-dark flex items-center gap-2">
          <Search className="w-7 h-7 text-dms-primary" />
          Semantische Suche
        </h1>
        <p className="text-dms-secondary mt-1">
          Finden Sie Dokumente anhand ihres Inhalts – nicht nur nach Dateinamen
        </p>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="relative">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Was suchen Sie? z.B. 'Telefonrechnung Januar'"
              className="w-full pl-12 pr-4 py-4 text-lg border border-gray-200 rounded-xl focus:ring-2 focus:ring-dms-primary focus:border-transparent shadow-sm"
            />
            <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dms-accent" />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-8 py-4 bg-dms-primary text-white rounded-xl font-medium hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
          >
            {loading ? "Suche..." : "Suchen"}
          </button>
        </div>
      </form>

      {/* Example Queries */}
      {!searched && (
        <div className="space-y-3">
          <p className="text-sm text-dms-secondary">Beispielsuchen:</p>
          <div className="flex flex-wrap gap-2">
            {exampleQueries.map((example, i) => (
              <button
                key={i}
                onClick={() => setQuery(example)}
                className="px-3 py-1.5 bg-gray-100 text-dms-secondary text-sm rounded-full hover:bg-gray-200 transition-colors"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {searched && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-dms-secondary">
              {results.length}{" "}
              {results.length === 1 ? "Ergebnis" : "Ergebnisse"} für "{query}"
            </p>
          </div>

          {results.length === 0 && !loading && (
            <div className="text-center py-12 bg-gray-50 rounded-xl">
              <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-dms-dark font-medium">
                Keine Ergebnisse gefunden
              </p>
              <p className="text-dms-secondary text-sm mt-1">
                Versuchen Sie andere Suchbegriffe oder laden Sie mehr Dokumente
                hoch
              </p>
            </div>
          )}

          <div className="space-y-3">
            {results.map((result, index) => (
              <div
                key={index}
                className="bg-white rounded-xl p-5 shadow-sm card-hover"
              >
                <div className="flex items-start gap-4">
                  <div className="text-3xl">📄</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-dms-dark truncate">
                        {result.document.name}
                      </h3>
                      <span className="text-xs px-2 py-0.5 bg-dms-primary/10 text-dms-primary rounded-full">
                        {Math.round(result.score * 100)}% Relevanz
                      </span>
                    </div>

                    <p className="text-dms-secondary text-sm mt-2 line-clamp-2">
                      {result.snippet || "Keine Vorschau verfügbar"}
                    </p>

                    {result.document.tags?.length > 0 && (
                      <div className="flex items-center gap-2 mt-3">
                        <Tag className="w-4 h-4 text-dms-secondary" />
                        <div className="flex gap-1">
                          {result.document.tags.slice(0, 3).map((tag, i) => (
                            <span
                              key={i}
                              className="text-xs px-2 py-0.5 bg-gray-100 text-dms-secondary rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
