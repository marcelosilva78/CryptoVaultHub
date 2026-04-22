import { categories } from "./categories";
import type { Article, Category } from "../components/types";

export { categories };

export function getAllArticles(): Article[] {
  return categories.flatMap((cat) => cat.articles);
}

export function getCategoryBySlug(slug: string): Category | undefined {
  return categories.find((cat) => cat.slug === slug);
}

export function getArticle(
  categorySlug: string,
  articleSlug: string,
): Article | undefined {
  const category = getCategoryBySlug(categorySlug);
  return category?.articles.find((a) => a.slug === articleSlug);
}

export function getFirstArticle(): {
  category: string;
  slug: string;
} | null {
  const first = categories[0]?.articles[0];
  if (!first) return null;
  return { category: categories[0].slug, slug: first.slug };
}
