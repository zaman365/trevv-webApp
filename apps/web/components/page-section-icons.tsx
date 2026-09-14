import type { PageSection } from "./page-sections";
import {
  ChartNoAxesCombined,
  FolderKanban,
  ListTodo,
  Lightbulb,
  Users,
  MessageCircleMore,
  Inbox,
  Sparkles,
  FileQuestion,
  ClipboardCheck,
  Clock3,
  CalendarDays,
  Search,
} from "lucide-react";
const sectionIcons = {
  overview: ChartNoAxesCombined,
  summary: ChartNoAxesCombined,
  workspaces: FolderKanban,
  planning: FolderKanban,
  "report-log": ClipboardCheck,
  "my-work": ListTodo,
  ideas: Lightbulb,
  teams: Users,
  people: Users,
  messages: MessageCircleMore,
  inbox: Inbox,
  attention: Sparkles,
  decisions: FileQuestion,
  approvals: ClipboardCheck,
  waiting: Clock3,
  reviews: ClipboardCheck,
  calendar: CalendarDays,
  search: Search,
};
export function withSectionIcons(
  sections: readonly PageSection[],
): PageSection[] {
  return sections.map((section) => {
    const Icon = sectionIcons[section.id as keyof typeof sectionIcons];
    return {
      ...section,
      icon:
        section.icon ??
        (Icon ? <Icon size={16} aria-hidden="true" /> : undefined),
    };
  });
}
