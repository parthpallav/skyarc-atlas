import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: "100px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "320px",
            height: "320px",
            background: "linear-gradient(135deg, #a855f7 0%, #6366f1 100%)",
            borderRadius: "64px",
            boxShadow: "0 20px 40px rgba(168, 85, 247, 0.4)",
          }}
        >
          <span
            style={{
              fontSize: "190px",
              fontWeight: 900,
              color: "#ffffff",
              fontFamily: "system-ui, -apple-system, sans-serif",
              letterSpacing: "-4px",
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
