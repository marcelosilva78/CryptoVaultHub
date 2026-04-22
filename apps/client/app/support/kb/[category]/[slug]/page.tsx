"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { KbLayout } from "../../components/kb-layout";
import { BlockRenderer } from "../../components/block-renderer";
import { Toc } from "../../components/toc";
import { DifficultyBadge } from "../../components/difficulty-badge";
import { FeedbackWidget } from "../../components/feedback-widget";
import { getArticle, getCategoryBySlug } from "../../data";

export default function ArticlePage() {
  const params = useParams<{ category: string; slug: string }>();
  const category = getCategoryBySlug(params.category);
  const article = getArticle(params.category, params.slug);

  if (!category || !article) {
    return (
      <KbLayout>
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
          <div className="text-heading text-text-primary mb-2">Artigo não encontrado</div>
          <div className="text-body text-text-muted mb-4">O artigo que você procura não existe ou foi movido.</div>
          <Link href="/support/kb" className="text-body text-accent-primary hover:underline">Voltar para Knowledge Base</Link>
        </div>
      </KbLayout>
    );
  }

  return (
    <KbLayout>
      <div className="flex">
        <div className="flex-1 max-w-3xl px-8 py-6">
          <div className="flex items-center gap-1.5 text-caption text-text-muted mb-4">
            <Link href="/support" className="hover:text-text-primary transition-colors no-underline text-text-muted">Suporte</Link>
            <ChevronRight className="w-3 h-3" />
            <Link href="/support/kb" className="hover:text-text-primary transition-colors no-underline text-text-muted">Knowledge Base</Link>
            <ChevronRight className="w-3 h-3" />
            <span>{category.title}</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-text-primary">{article.title}</span>
          </div>
          <h1 className="text-heading text-text-primary mb-3">{article.title}</h1>
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <DifficultyBadge level={article.difficulty} />
            <span className="text-caption text-text-muted">{article.readingTime} min leitura</span>
            <span className="text-caption text-text-muted">Atualizado: {article.updatedAt}</span>
          </div>
          <p className="text-body text-text-secondary leading-relaxed mb-6 pb-6 border-b border-border-subtle">{article.description}</p>
          <BlockRenderer blocks={article.blocks} />
          <FeedbackWidget articleSlug={`${params.category}-${params.slug}`} />
        </div>
        <div className="hidden xl:block pr-6 pt-6">
          <Toc blocks={article.blocks} />
        </div>
      </div>
    </KbLayout>
  );
}
