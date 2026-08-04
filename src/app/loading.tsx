import Image from "next/image";

/**
 * App-wide loading fallback (shown during route transitions). Uses the brand
 * logomark as a pulsing loader.
 */
export default function Loading() {
  return (
    <div className="appLoading" role="status" aria-label="Loading">
      <Image
        alt=""
        aria-hidden="true"
        height={64}
        priority
        src="/icon.svg"
        width={64}
      />
      <span>Loading…</span>
    </div>
  );
}
