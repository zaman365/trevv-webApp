"use client";
import {
  Activity,
  Suspense,
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArrowUpRight } from "lucide-react";
import { PageTabs } from "./page-tabs";
export { PageTabs } from "./page-tabs";
import { AppLink as Link } from "@/components/navigation-link";
import { pageSectionUrl, sectionFromSearch } from "@/lib/page-sections";
import layoutStyles from "./page-sections.module.css";
import { withSectionIcons } from "./page-section-icons";

export interface PageSection {
  id: string;
  label: string;
  icon?: ReactNode;
  title?: string | undefined;
  description?: string | undefined;
  href?: string;
}
const EmbeddedSection = createContext(false);
export const useEmbeddedSection = () => useContext(EmbeddedSection);

export function PageSections({
  sections,
  label,
  scope,
  children,
  renderSection,
  onSectionChange,
  toolbar,
  queryParameter = "section",
}: {
  sections: readonly PageSection[];
  label: string;
  scope: string;
  children: ReactNode;
  renderSection(section: string): ReactNode;
  onSectionChange?: ((section: string) => void) | undefined;
  toolbar?: ReactNode;
  queryParameter?: string;
}) {
  return (
    <SectionState
      key={scope}
      {...{
        sections,
        label,
        children,
        renderSection,
        onSectionChange,
        toolbar,
        queryParameter,
      }}
    />
  );
}
function SectionState({
  sections,
  label,
  children,
  renderSection,
  onSectionChange,
  toolbar,
  queryParameter,
}: Omit<Parameters<typeof PageSections>[0], "scope">) {
  const id = useId();
  const fallback = sections[0]!.id;
  const [selected, setSelected] = useState(fallback);
  const [visited, setVisited] = useState([fallback]);
  const ids = sections.map((entry) => entry.id).join("|");
  const notify = useRef(onSectionChange);
  useEffect(() => {
    notify.current = onSectionChange;
  }, [onSectionChange]);
  useEffect(() => {
    const sync = () => {
      const next = sectionFromSearch(
        window.location.search,
        ids.split("|"),
        fallback,
        queryParameter,
      );
      setSelected(next);
      setVisited((before) =>
        before.includes(next) ? before : [...before, next],
      );
      notify.current?.(next);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [ids, fallback, queryParameter]);
  function select(next: string) {
    if (next === selected) return;
    window.history.pushState(
      null,
      "",
      pageSectionUrl(window.location.href, next, fallback, queryParameter),
    );
    setSelected(next);
    setVisited((before) =>
      before.includes(next) ? before : [...before, next],
    );
    notify.current?.(next);
  }
  return (
    <div className={layoutStyles.panel}>
      <PageTabs
        sections={withSectionIcons(sections)}
        value={selected}
        onChange={select}
        label={label}
        id={id}
      />
      {toolbar}
      {sections.map((section) => (
        <Activity
          key={section.id}
          mode={selected === section.id ? "visible" : "hidden"}
        >
          <section
            className={layoutStyles.panel}
            role="tabpanel"
            id={`${id}-panel-${section.id}`}
            aria-labelledby={`${id}-tab-${section.id}`}
            tabIndex={0}
          >
            {visited.includes(section.id) ? (
              <>
                {section.title || section.href ? (
                  <header className={layoutStyles.heading}>
                    <div>
                      {section.title ? <h2>{section.title}</h2> : null}
                      {section.description ? (
                        <p>{section.description}</p>
                      ) : null}
                    </div>
                    {section.href ? (
                      <Link
                        href={section.href}
                        aria-label={`Open ${section.label} full page`}
                      >
                        Open full page{" "}
                        <ArrowUpRight size={16} aria-hidden="true" />
                      </Link>
                    ) : null}
                  </header>
                ) : null}
                <Suspense
                  fallback={<p role="status">Loading {section.label}…</p>}
                >
                  {section.id === fallback ? (
                    children
                  ) : (
                    <EmbeddedSection.Provider value>
                      {renderSection(section.id)}
                    </EmbeddedSection.Provider>
                  )}
                </Suspense>
              </>
            ) : null}
          </section>
        </Activity>
      ))}
    </div>
  );
}
