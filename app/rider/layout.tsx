import type { Metadata } from "next";
import "./rider.css";
import "./rider-oauth.css";
import "./rider-suggestions.css";

export const metadata: Metadata = {
  title: "Ratroo Rider — Register your local service",
  description: "A simple way for bus, auto and e-rickshaw operators to add their vehicles, stands and routes to Ratroo.",
  robots: { index: false, follow: false },
};

export default function RiderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
