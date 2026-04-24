USE cvh_admin;

CREATE TABLE IF NOT EXISTS knowledge_base_articles (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(128) NOT NULL,
  title VARCHAR(255) NOT NULL,
  summary VARCHAR(500) NULL,
  content LONGTEXT NOT NULL,
  category ENUM('getting_started','wallets','deposits','withdrawals','security','api','webhooks','compliance','troubleshooting','faq') NOT NULL,
  tags JSON NULL,
  author_id BIGINT NULL,
  is_published TINYINT(1) NOT NULL DEFAULT 0,
  is_featured TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  view_count INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  published_at DATETIME(3) NULL,
  UNIQUE KEY uq_slug (slug),
  INDEX idx_category_published (category, is_published),
  INDEX idx_featured (is_featured, sort_order),
  FULLTEXT INDEX ft_search (title, content)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
