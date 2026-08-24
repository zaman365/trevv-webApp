import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        background: "#5956c9",
        borderRadius: 112,
        fontFamily: "Arial, sans-serif",
        fontSize: 272,
        fontWeight: 800,
        letterSpacing: -28,
        boxShadow: "inset 0 0 0 18px rgba(255,255,255,.18)",
      }}
    >
      T
    </div>,
    size,
  );
}
