interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  if (!items.length) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      data-ocid="breadcrumb.nav"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-card border border-border/20 text-sm"
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={item.label} className="flex items-center gap-1.5 min-w-0">
            {isLast ? (
              <span
                data-ocid={`breadcrumb.item.${i + 1}`}
                className="text-foreground font-medium truncate"
              >
                {item.label}
              </span>
            ) : item.href ? (
              <a
                href={item.href}
                data-ocid={`breadcrumb.item.${i + 1}`}
                className="text-muted-foreground hover:text-[#00A3FF] transition-colors duration-200 truncate"
              >
                {item.label}
              </a>
            ) : (
              <span
                data-ocid={`breadcrumb.item.${i + 1}`}
                className="text-muted-foreground truncate"
              >
                {item.label}
              </span>
            )}

            {!isLast && (
              <span
                aria-hidden="true"
                className="text-[#00A3FF]/60 font-light select-none flex-shrink-0"
              >
                ›
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
