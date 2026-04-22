"use client";

import { cn } from "@/lib/utils";
import { services, incidents } from "./data/status-data";

const statusConfig = {
  operational: { label: "Operacional", dot: "bg-status-success", text: "text-status-success" },
  degraded: { label: "Degradado", dot: "bg-status-warning", text: "text-status-warning" },
  outage: { label: "Indisponível", dot: "bg-status-error", text: "text-status-error" },
  maintenance: { label: "Manutenção", dot: "bg-[#3b82f6]", text: "text-[#3b82f6]" },
};

const incidentStatusLabels: Record<string, string> = { resolved: "Resolvido", monitoring: "Monitorando", identified: "Identificado", investigating: "Investigando" };

export default function StatusPage() {
  const allOperational = services.every((s) => s.status === "operational");

  return (
    <div className="animate-fade-in max-w-3xl mx-auto py-8 px-6">
      <h1 className="text-heading text-text-primary mb-2">Status do Sistema</h1>
      <p className="text-body text-text-secondary mb-6">Monitoramento dos serviços da plataforma</p>
      <div className={cn("p-4 rounded-card border mb-8 flex items-center gap-3", allOperational ? "border-status-success/30 bg-status-success-subtle" : "border-status-warning/30 bg-status-warning-subtle")}>
        <div className={cn("w-3 h-3 rounded-full", allOperational ? "bg-status-success" : "bg-status-warning")} />
        <span className={cn("text-body font-semibold", allOperational ? "text-status-success" : "text-status-warning")}>{allOperational ? "Todos os sistemas operacionais" : "Alguns sistemas com problemas"}</span>
      </div>
      <div className="space-y-2 mb-10">
        {services.map((service) => {
          const config = statusConfig[service.status];
          return (
            <div key={service.name} className="flex items-center justify-between p-4 rounded-card border border-border-subtle">
              <div>
                <div className="text-body font-medium text-text-primary">{service.name}</div>
                <div className="text-caption text-text-muted">{service.description}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-caption text-text-muted">{service.uptime}</span>
                <div className="flex items-center gap-1.5">
                  <div className={cn("w-2 h-2 rounded-full", config.dot)} />
                  <span className={cn("text-caption font-medium", config.text)}>{config.label}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <h2 className="text-subheading text-text-primary mb-4">Incidentes Recentes</h2>
      {incidents.length === 0 ? (
        <div className="text-body text-text-muted p-8 text-center border border-border-subtle rounded-card">Nenhum incidente nos últimos 30 dias</div>
      ) : (
        <div className="space-y-3">
          {incidents.map((incident, i) => (
            <div key={i} className="p-4 rounded-card border border-border-subtle">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-caption text-text-muted">{incident.date}</span>
                <span className="text-caption font-medium text-status-success">{incidentStatusLabels[incident.status]}</span>
              </div>
              <div className="text-body font-medium text-text-primary mb-1">{incident.title}</div>
              <div className="text-body text-text-secondary leading-relaxed">{incident.description}</div>
              <div className="flex gap-2 mt-2">
                {incident.affectedServices.map((s) => (
                  <span key={s} className="text-micro px-2 py-0.5 rounded-badge bg-surface-elevated text-text-muted">{s}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
