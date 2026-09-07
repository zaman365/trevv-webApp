import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createApiClient } from "@founderhq/api-client";
import {
  captureMessageScrollAnchor,
  restoreMessageScrollAnchor,
  type CollectionScrollAnchor,
} from "../lib/collection-scroll-anchor";
import {
  WindowedCollection,
  type WindowedCollectionHandle,
} from "../components/windowed-collection";
import { MessageComposerInput } from "../components/message-composer-input";
import { useBufferedPersistence } from "../lib/use-buffered-persistence";
import { useWorkItemDetails } from "../lib/use-work-item-details";

const commits = { rows: 0, parent: 0 };
Object.assign(window, { uiInteractionCommits: commits });
const rows = Array.from({ length: 10_000 }, (_, index) => ({
  id: String(index),
  title: `Item ${index}`,
}));
const itemKey = (item: { id: string }) => item.id;
const Row = memo(function Row({ item }: { item: (typeof rows)[number] }) {
  useLayoutEffect(() => {
    commits.rows++;
  });
  return (
    <article style={{ padding: 12, minHeight: 64, boxSizing: "border-box" }}>
      <button>{item.title}</button>
      <input aria-label={`Edit ${item.title}`} defaultValue={item.title} />
    </article>
  );
});
function ListFixture() {
  useLayoutEffect(() => {
    commits.parent++;
  });
  const [hasBody, setHasBody] = useState(false);
  const body = useRef("");
  const persist = useCallback(
    (value: string) => localStorage.setItem("fixture-draft", value),
    [],
  );
  const writer = useBufferedPersistence(persist);
  const renderRow = useCallback(
    (item: (typeof rows)[number]) => <Row item={item} />,
    [],
  );
  return (
    <>
      <label htmlFor="live-message-composer">Message</label>
      <MessageComposerInput
        initialBody=""
        title="Test room"
        disabled={false}
        onBlur={writer.flush}
        onChange={(value) => {
          body.current = value;
          setHasBody(Boolean(value.trim()));
          writer.schedule(value);
        }}
      />
      <button
        disabled={!hasBody}
        onClick={() => {
          writer.flush();
          document.querySelector("#sent")!.textContent = body.current;
        }}
      >
        Send
      </button>
      <output id="sent" />
      <WindowedCollection
        items={rows}
        itemKey={itemKey}
        estimateHeight={80}
        label="Work records"
      >
        {renderRow}
      </WindowedCollection>
      <button>After collection</button>
    </>
  );
}
function DetailsFixture() {
  const [itemId, setItemId] = useState<string | null>("item-a");
  const client = useMemo(() => {
    const api = createApiClient({ baseUrl: "/api/v1" });
    // Deliberately ignore cancellation to prove late completions cannot change another entity's state.
    return { ...api, withSignal: () => api };
  }, []);
  const query = useWorkItemDetails(client, "organization", "workspace", itemId);
  return (
    <>
      <button onClick={() => setItemId("item-a")}>Item A</button>
      <button onClick={() => setItemId("item-b")}>Item B</button>
      <output id="selected">{itemId}</output>
      <output id="history">
        {query.data?.history[0]?.summary ?? "Loading"}
      </output>
    </>
  );
}
const replyRows = Array.from({ length: 300 }, (_, index) => ({
  id: `reply-${index}`,
  title: `Reply ${index}`,
}));
const nestedRows = Array.from({ length: 300 }, (_, index) => ({
  id: `parent-${index}`,
  title: `Parent ${index}`,
}));
function NestedFixture() {
  return (
    <WindowedCollection
      items={nestedRows}
      itemKey={itemKey}
      label="Outer timeline"
      estimateHeight={100}
    >
      {(item, index) => (
        <article>
          <button>{item.title}</button>
          {index === 0 && (
            <WindowedCollection
              items={replyRows}
              itemKey={itemKey}
              label="Nested replies"
              estimateHeight={80}
            >
              {(reply) => <Row item={reply} />}
            </WindowedCollection>
          )}
        </article>
      )}
    </WindowedCollection>
  );
}
const initialHistory = Array.from({ length: 100 }, (_, index) => ({
  id: `message-${index}`,
  title: `Message ${index}`,
  height: 70 + (index % 4) * 24,
}));
function HistoryFixture() {
  const [items, setItems] = useState(initialHistory);
  const scroller = useRef<HTMLDivElement>(null);
  const api = useRef<WindowedCollectionHandle>(null);
  const anchor = useRef<CollectionScrollAnchor | null>(null);
  useLayoutEffect(() => {
    if (anchor.current && scroller.current)
      restoreMessageScrollAnchor(scroller.current, anchor.current, api.current);
  }, [items]);
  return (
    <>
      <button
        onClick={() => {
          anchor.current = captureMessageScrollAnchor(
            scroller.current!,
            new Set(items.map(itemKey)),
          );
          setItems((current) => [
            ...Array.from({ length: 50 }, (_, index) => ({
              id: `older-${current.length}-${index}`,
              title: `Earlier ${index}`,
              height: 95,
            })),
            ...current,
          ]);
        }}
      >
        Load earlier history
      </button>
      <div
        ref={scroller}
        role="region"
        aria-label="History scroll"
        style={{ height: 400, overflow: "auto" }}
      >
        <WindowedCollection
          apiRef={api}
          scrollRef={scroller}
          items={items}
          itemKey={itemKey}
          estimateHeight={150}
          label="History messages"
        >
          {(item) => (
            <article
              data-message-id={item.id}
              style={{ height: item.height, boxSizing: "border-box" }}
            >
              <button>{item.title}</button>
            </article>
          )}
        </WindowedCollection>
      </div>
    </>
  );
}
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    {location.hash === "#details" ? (
      <DetailsFixture />
    ) : location.hash === "#nested" ? (
      <NestedFixture />
    ) : location.hash === "#history" ? (
      <HistoryFixture />
    ) : (
      <ListFixture />
    )}
  </QueryClientProvider>,
);
