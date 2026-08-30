import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#000000",
          borderRadius: "36px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "120px",
            height: "120px",
            background: "linear-gradient(135deg, #a855f7 0%, #6366f1 100%)",
            borderRadius: "26px",
          }}
        >
          <span
            style={{
              fontSize: "72px",
              fontWeight: 900,
              color: "#ffffff",
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            S
          </span>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
