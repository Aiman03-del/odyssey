import CanvasLoader from "@/components/CanvasLoader";

export default function Home() {
  return (
    <main>
      {/* Fixed 3D canvas + loading screen */}
      <CanvasLoader />

      {/* This tall div creates the scrollable page height (500vh). */}
      <div style={{ height: "700vh" }} />
    </main>
  );
}