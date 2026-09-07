"use client";
import { useState } from "react";

export function MessageComposerInput({
  initialBody,
  disabled,
  title,
  onChange,
  onBlur,
}: {
  initialBody: string;
  disabled: boolean;
  title: string;
  onChange: (body: string) => void;
  onBlur: () => void;
}) {
  const [body, setBody] = useState(initialBody);
  return (
    <textarea
      disabled={disabled}
      id="live-message-composer"
      rows={2}
      placeholder={`Message ${title}`}
      value={body}
      onBlur={onBlur}
      onChange={(event) => {
        setBody(event.target.value);
        onChange(event.target.value);
      }}
    />
  );
}
