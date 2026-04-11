export default function PageHeader({ eyebrow, title, description, children }) {
  return (
    <header className="page-header saas-page-header w-full min-w-0 max-w-full">
      {eyebrow ? <p className="page-eyebrow">{eyebrow}</p> : null}
      <div className="page-header-row w-full min-w-0 flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="page-header-text min-w-0 max-w-full flex-1">
          <h1 className="page-title break-words">{title}</h1>
          {description ? <p className="page-lead">{description}</p> : null}
        </div>
        {children ? (
          <div className="page-header-actions flex w-full min-w-0 shrink-0 flex-wrap gap-2 sm:w-auto sm:justify-end">
            {children}
          </div>
        ) : null}
      </div>
    </header>
  );
}
