export default function PageHeader({ eyebrow, title, description, children }) {
  return (
    <header className="page-header">
      {eyebrow ? <p className="page-eyebrow">{eyebrow}</p> : null}
      <div className="page-header-row">
        <div className="page-header-text">
          <h1 className="page-title">{title}</h1>
          {description ? <p className="page-lead">{description}</p> : null}
        </div>
        {children ? <div className="page-header-actions">{children}</div> : null}
      </div>
    </header>
  );
}
