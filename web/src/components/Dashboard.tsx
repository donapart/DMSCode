"use client";

import {
  Clock,
  FileText,
  HardDrive,
  Search,
  Sparkles,
  Tag,
  TrendingUp,
  Upload,
} from "lucide-react";

interface DashboardProps {
  stats: {
    totalDocuments: number;
    recentDocuments: number;
    totalTags: number;
    storageUsed: string;
  };
  onNavigate: (view: "dashboard" | "documents" | "search" | "upload") => void;
}

export function Dashboard({ stats, onNavigate }: DashboardProps) {
  const statCards = [
    {
      label: "Dokumente",
      value: stats.totalDocuments,
      icon: FileText,
      color: "bg-blue-500",
      onClick: () => onNavigate("documents"),
    },
    {
      label: "Diese Woche",
      value: stats.recentDocuments,
      icon: Clock,
      color: "bg-green-500",
    },
    {
      label: "Tags",
      value: stats.totalTags,
      icon: Tag,
      color: "bg-purple-500",
    },
    {
      label: "Speicher",
      value: stats.storageUsed,
      icon: HardDrive,
      color: "bg-orange-500",
    },
  ];

  const quickActions = [
    {
      label: "Dokument hochladen",
      icon: Upload,
      color: "bg-dms-primary hover:bg-blue-700",
      onClick: () => onNavigate("upload"),
    },
    {
      label: "Suche starten",
      icon: Search,
      color: "bg-dms-secondary hover:bg-slate-600",
      onClick: () => onNavigate("search"),
    },
    {
      label: "AI-Analyse",
      icon: Sparkles,
      color: "bg-dms-accent hover:bg-amber-600",
      onClick: () => alert("AI-Analyse kommt bald!"),
    },
  ];

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-dms-dark">
            Willkommen bei DMSCode
          </h1>
          <p className="text-dms-secondary mt-1">
            Ihr intelligentes Dokumentenmanagement
          </p>
        </div>
        <div className="flex gap-2">
          {quickActions.map((action, index) => {
            const Icon = action.icon;
            return (
              <button
                key={index}
                onClick={action.onClick}
                className={`
                  ${action.color} text-white
                  px-4 py-2 rounded-lg
                  flex items-center gap-2
                  transition-all duration-200
                  shadow-md hover:shadow-lg
                `}
              >
                <Icon className="w-5 h-5" />
                <span className="hidden md:inline">{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              onClick={stat.onClick}
              className={`
                bg-white rounded-xl p-6 shadow-sm card-hover
                ${stat.onClick ? "cursor-pointer" : ""}
              `}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-dms-secondary text-sm">{stat.label}</p>
                  <p className="text-2xl md:text-3xl font-bold text-dms-dark mt-1">
                    {stat.value}
                  </p>
                </div>
                <div className={`${stat.color} p-3 rounded-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Activity & Quick Tips */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-dms-dark mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-dms-primary" />
            Letzte Aktivitäten
          </h2>
          <div className="space-y-3">
            {stats.totalDocuments === 0 ? (
              <p className="text-dms-secondary text-sm">
                Noch keine Dokumente vorhanden. Laden Sie Ihr erstes Dokument
                hoch!
              </p>
            ) : (
              <p className="text-dms-secondary text-sm">
                {stats.recentDocuments} neue Dokumente in den letzten 7 Tagen
              </p>
            )}
          </div>
        </div>

        {/* AI Features */}
        <div className="bg-gradient-to-br from-dms-primary to-blue-700 rounded-xl p-6 shadow-sm text-white">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            AI-Funktionen
          </h2>
          <ul className="space-y-2 text-sm opacity-90">
            <li className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Automatische Texterkennung (OCR)
            </li>
            <li className="flex items-center gap-2">
              <Search className="w-4 h-4" />
              Semantische Dokumentensuche
            </li>
            <li className="flex items-center gap-2">
              <Tag className="w-4 h-4" />
              Intelligentes Auto-Tagging
            </li>
            <li className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Dokumentenanalyse mit Claude
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
