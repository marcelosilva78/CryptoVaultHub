"use client";

import Link from "next/link";
import { BookOpen, HelpCircle, FileText, Activity } from "lucide-react";

const sections = [
  { title: "Knowledge Base", description: "Guias completos e tutoriais passo a passo para todas as funcionalidades do portal", href: "/support/kb", icon: BookOpen, accent: true },
  { title: "FAQ", description: "Perguntas frequentes e respostas rápidas", href: "/support/faq", icon: HelpCircle },
  { title: "Changelog", description: "Novidades e atualizações do sistema", href: "/support/changelog", icon: FileText },
  { title: "Status do Sistema", description: "Monitoramento em tempo real dos serviços", href: "/support/status", icon: Activity },
];

export default function SupportHubPage() {
  return (
    <div className="animate-fade-in max-w-3xl mx-auto py-12 px-6">
      <div className="text-center mb-10">
        <h1 className="text-display text-text-primary mb-2">Central de Suporte</h1>
        <p className="text-body text-text-secondary">Encontre guias, tutoriais e respostas para suas dúvidas sobre o portal</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.href} href={s.href} className={`group p-6 rounded-card border transition-all duration-fast no-underline ${s.accent ? "border-accent-primary/30 bg-accent-glow hover:border-accent-primary hover:shadow-glow" : "border-border-subtle hover:border-border-default hover:bg-surface-hover"}`}>
              <Icon className={`w-8 h-8 mb-3 ${s.accent ? "text-accent-primary" : "text-text-muted group-hover:text-text-primary transition-colors"}`} />
              <div className="text-subheading text-text-primary">{s.title}</div>
              <div className="text-caption text-text-muted mt-1">{s.description}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
