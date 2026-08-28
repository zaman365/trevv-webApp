"use client";

import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Bookmark,
  Check,
  CheckCircle2,
  Clock3,
  GraduationCap,
  Layers3,
  Lightbulb,
  ListChecks,
  PlayCircle,
  Search,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import {
  createContext,
  useContext,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type ReactNode,
} from "react";
import {
  getLearningResource,
  learningCategories,
  learningResources,
  searchLearningResources,
  type LearningCategory,
  type LearningResource,
} from "@/lib/learning-resources";
import { useWorkspace } from "@/lib/workspace-context";
import { resolveLearningRoute } from "@/lib/learning-routes";

interface LearningCenterContextValue {
  openLearningCenter: (resourceId?: string) => void;
  closeLearningCenter: () => void;
  isOpen: boolean;
}

interface LearningProgress {
  saved: string[];
  completed: string[];
}

const LEARNING_PROGRESS_KEY = "trevv.learning-progress.v1";
const LEARNING_PROGRESS_EVENT = "trevv-learning-progress-change";
const emptyProgress: LearningProgress = { saved: [], completed: [] };

const LearningCenterContext = createContext<LearningCenterContextValue | null>(
  null,
);

const categoryIcons: Record<LearningCategory, LucideIcon> = {
  "Getting started": Sparkles,
  "Structure & work": Layers3,
  "Focus & decisions": Lightbulb,
  Collaboration: GraduationCap,
  "Reporting & routines": ListChecks,
  Administration: BookOpenText,
};

function subscribeToLearningProgress(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(LEARNING_PROGRESS_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(LEARNING_PROGRESS_EVENT, onStoreChange);
  };
}

function getLearningProgressSnapshot(): string | null {
  return window.localStorage.getItem(LEARNING_PROGRESS_KEY);
}

function parseLearningProgress(raw: string | null): LearningProgress {
  if (!raw) return emptyProgress;
  try {
    const parsed = JSON.parse(raw) as Partial<LearningProgress>;
    return {
      saved: Array.isArray(parsed.saved) ? parsed.saved : [],
      completed: Array.isArray(parsed.completed) ? parsed.completed : [],
    };
  } catch {
    return emptyProgress;
  }
}

function writeLearningProgress(progress: LearningProgress) {
  window.localStorage.setItem(LEARNING_PROGRESS_KEY, JSON.stringify(progress));
  window.dispatchEvent(new Event(LEARNING_PROGRESS_EVENT));
}

export function LearningCenterProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const openLearningCenter = (resourceId?: string) => {
    setSelectedId(
      resourceId && getLearningResource(resourceId) ? resourceId : null,
    );
    setOpen(true);
  };

  const closeLearningCenter = () => setOpen(false);

  return (
    <LearningCenterContext.Provider
      value={{ openLearningCenter, closeLearningCenter, isOpen: open }}
    >
      {children}
      {open && (
        <LearningCenterDrawer
          selectedId={selectedId}
          onSelect={setSelectedId}
          onClose={closeLearningCenter}
        />
      )}
    </LearningCenterContext.Provider>
  );
}

export function useLearningCenter(): LearningCenterContextValue {
  const context = useContext(LearningCenterContext);
  if (!context) {
    throw new Error(
      "useLearningCenter must be used inside LearningCenterProvider.",
    );
  }
  return context;
}

export function Hint({
  resourceId,
  label,
}: {
  resourceId: string;
  label?: string;
}) {
  const { openLearningCenter } = useLearningCenter();
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const resource = getLearningResource(resourceId);

  if (!resource) return null;

  const closeWhenFocusLeaves = (event: FocusEvent<HTMLSpanElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  };

  return (
    <span className="trevv-hint" onBlur={closeWhenFocusLeaves}>
      <button
        type="button"
        className="trevv-hint-trigger"
        aria-label={label ?? `Hint: ${resource.title}`}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        title={`Hint: ${resource.title}`}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        <Lightbulb size={12} />
      </button>
      {open && (
        <span className="trevv-hint-popover" id={tooltipId} role="tooltip">
          <span className="hint-popover-label">
            <Lightbulb size={12} /> Helpful hint
          </span>
          <strong>{resource.title}</strong>
          <span>{resource.summary}</span>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              openLearningCenter(resource.id);
            }}
          >
            Open full guide <ArrowRight size={12} />
          </button>
        </span>
      )}
    </span>
  );
}

function LearningCenterDrawer({
  selectedId,
  onSelect,
  onClose,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<LearningCategory | "All">("All");
  const [collection, setCollection] = useState<"all" | "saved" | "completed">(
    "all",
  );
  const progressRaw = useSyncExternalStore(
    subscribeToLearningProgress,
    getLearningProgressSnapshot,
    () => null,
  );
  const progress = useMemo(
    () => parseLearningProgress(progressRaw),
    [progressRaw],
  );
  const saved = useMemo(() => new Set(progress.saved), [progress.saved]);
  const completed = useMemo(
    () => new Set(progress.completed),
    [progress.completed],
  );
  const selected = selectedId ? getLearningResource(selectedId) : undefined;

  const visibleResources = useMemo(() => {
    const matches = searchLearningResources(query, category);
    if (collection === "saved") {
      return matches.filter((resource) => saved.has(resource.id));
    }
    if (collection === "completed") {
      return matches.filter((resource) => completed.has(resource.id));
    }
    return matches;
  }, [category, collection, completed, query, saved]);

  const updateProgress = (key: keyof LearningProgress, resourceId: string) => {
    const current = parseLearningProgress(
      window.localStorage.getItem(LEARNING_PROGRESS_KEY),
    );
    const values = new Set(current[key]);
    if (values.has(resourceId)) values.delete(resourceId);
    else values.add(resourceId);
    writeLearningProgress({ ...current, [key]: [...values] });
  };

  return (
    <div className="learning-layer" role="presentation" onMouseDown={onClose}>
      <aside
        className="learning-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <header className="learning-header">
          {selected ? (
            <button
              type="button"
              className="learning-back"
              onClick={() => onSelect(null)}
              aria-label="Back to all learning resources"
            >
              <ArrowLeft size={18} />
            </button>
          ) : (
            <span className="learning-brand-icon">
              <Lightbulb size={18} />
            </span>
          )}
          <div>
            <p>TREVV guidance</p>
            <h2 id={titleId}>
              {selected ? selected.title : "Learning Center"}
            </h2>
          </div>
          <button
            type="button"
            className="learning-close"
            onClick={onClose}
            aria-label="Close Learning Center"
          >
            <X size={18} />
          </button>
        </header>

        {selected ? (
          <LearningResourceDetail
            resource={selected}
            saved={saved.has(selected.id)}
            completed={completed.has(selected.id)}
            onSaved={() => updateProgress("saved", selected.id)}
            onCompleted={() => updateProgress("completed", selected.id)}
            onClose={onClose}
          />
        ) : (
          <>
            <div className="learning-tools">
              <label className="learning-search">
                <Search size={15} />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search guides, tutorials, and tips…"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear learning search"
                  >
                    <X size={13} />
                  </button>
                )}
              </label>
              <div
                className="learning-collections"
                role="group"
                aria-label="Learning collection"
              >
                <button
                  type="button"
                  className={collection === "all" ? "active" : ""}
                  onClick={() => setCollection("all")}
                >
                  All <b>{learningResources.length}</b>
                </button>
                <button
                  type="button"
                  className={collection === "saved" ? "active" : ""}
                  onClick={() => setCollection("saved")}
                >
                  <Bookmark size={12} /> Saved <b>{saved.size}</b>
                </button>
                <button
                  type="button"
                  className={collection === "completed" ? "active" : ""}
                  onClick={() => setCollection("completed")}
                >
                  <CheckCircle2 size={12} /> Completed <b>{completed.size}</b>
                </button>
              </div>
              <div
                className="learning-categories"
                aria-label="Learning categories"
              >
                <button
                  type="button"
                  className={category === "All" ? "active" : ""}
                  onClick={() => setCategory("All")}
                >
                  All topics
                </button>
                {learningCategories.map((name) => (
                  <button
                    type="button"
                    className={category === name ? "active" : ""}
                    onClick={() => setCategory(name)}
                    key={name}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <div className="learning-library">
              {!query && category === "All" && collection === "all" && (
                <section className="learning-start-here">
                  <span>
                    <PlayCircle size={19} />
                  </span>
                  <div>
                    <p>Recommended first</p>
                    <h3>Learn the TREVV operating rhythm</h3>
                    <small>Start with a focused five-minute tour.</small>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelect("welcome-to-trevv")}
                  >
                    Start <ArrowRight size={13} />
                  </button>
                </section>
              )}

              {learningCategories.map((name) => {
                const resources = visibleResources.filter(
                  (resource) => resource.category === name,
                );
                if (!resources.length) return null;
                const Icon = categoryIcons[name];
                return (
                  <section className="learning-group" key={name}>
                    <header>
                      <span>
                        <Icon size={15} />
                      </span>
                      <h3>{name}</h3>
                      <b>{resources.length}</b>
                    </header>
                    {resources.map((resource) => (
                      <LearningResourceRow
                        resource={resource}
                        saved={saved.has(resource.id)}
                        completed={completed.has(resource.id)}
                        onSelect={() => onSelect(resource.id)}
                        key={resource.id}
                      />
                    ))}
                  </section>
                );
              })}

              {!visibleResources.length && (
                <div className="learning-empty">
                  <Search size={24} />
                  <h3>No learning resources found</h3>
                  <p>Try another phrase, category, or collection.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setCategory("All");
                      setCollection("all");
                    }}
                  >
                    Reset filters
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function LearningResourceRow({
  resource,
  saved,
  completed,
  onSelect,
}: {
  resource: LearningResource;
  saved: boolean;
  completed: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" className="learning-resource-row" onClick={onSelect}>
      <span
        className={`learning-type type-${resource.type.toLocaleLowerCase()}`}
      >
        {resource.type === "Tutorial" ? (
          <PlayCircle size={14} />
        ) : resource.type === "Tip" ? (
          <Lightbulb size={14} />
        ) : (
          <BookOpenText size={14} />
        )}
      </span>
      <span>
        <strong>{resource.title}</strong>
        <small>{resource.summary}</small>
        <i>
          {resource.type} · {resource.duration}
        </i>
      </span>
      <span className="learning-row-state">
        {saved && <Bookmark size={13} aria-label="Saved" />}
        {completed && <CheckCircle2 size={13} aria-label="Completed" />}
        <ArrowRight size={14} />
      </span>
    </button>
  );
}

function LearningResourceDetail({
  resource,
  saved,
  completed,
  onSaved,
  onCompleted,
  onClose,
}: {
  resource: LearningResource;
  saved: boolean;
  completed: boolean;
  onSaved: () => void;
  onCompleted: () => void;
  onClose: () => void;
}) {
  const CategoryIcon = categoryIcons[resource.category];
  const { scope } = useWorkspace();
  const workspaceSlug = scope.hubs[0]?.slug;
  const resourceRoute = resolveLearningRoute(resource.route, workspaceSlug);
  return (
    <div className="learning-detail">
      <div className="learning-detail-meta">
        <span>
          <CategoryIcon size={14} /> {resource.category}
        </span>
        <span>{resource.type}</span>
        <span>
          <Clock3 size={12} /> {resource.duration}
        </span>
      </div>
      <p className="learning-detail-summary">{resource.summary}</p>
      <p className="learning-detail-body">{resource.body}</p>

      {resource.steps && (
        <section className="learning-steps">
          <h3>
            {resource.type === "Tutorial" ? "Follow these steps" : "Key points"}
          </h3>
          <ol>
            {resource.steps.map((step, index) => (
              <li key={step}>
                <b>{index + 1}</b>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {resource.tips && resource.tips.length > 0 && (
        <section className="learning-tips">
          <header>
            <Lightbulb size={15} />
            <h3>Tips & tricks</h3>
          </header>
          {resource.tips.map((tip) => (
            <p key={tip}>{tip}</p>
          ))}
        </section>
      )}

      <footer className="learning-detail-actions">
        <button
          type="button"
          className={saved ? "active" : ""}
          onClick={onSaved}
        >
          <Bookmark size={14} /> {saved ? "Saved" : "Save for later"}
        </button>
        <button
          type="button"
          className={completed ? "complete" : ""}
          onClick={onCompleted}
        >
          {completed ? <Check size={14} /> : <CheckCircle2 size={14} />}
          {completed ? "Completed" : "Mark complete"}
        </button>
        {resourceRoute && (
          <Link href={resourceRoute} onClick={onClose}>
            Open in TREVV <ArrowRight size={13} />
          </Link>
        )}
      </footer>
    </div>
  );
}

