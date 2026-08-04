"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import { chipTone, label } from "@/lib/crm-api";

export function CrmTabs() {
  const path = usePathname();
  const tabs = [
    ["/dashboard", "Dashboard"],
    ["/clients", "Clients"],
  ] as const;
  return (
    <nav className="crmTabs" aria-label="CRM sections">
      {tabs.map(([href, text]) => {
        const current =
          href === "/clients"
            ? path.startsWith("/clients")
            : path === href;
        return (
          <Link
            aria-current={current ? "page" : undefined}
            href={href}
            key={href}
          >
            {text}
          </Link>
        );
      })}
    </nav>
  );
}

export function CrmPageHead({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
}) {
  return (
    <section className="pageHead crmPageHead">
      <div className="wrap">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {lede && <p className="lede">{lede}</p>}
        <CrmTabs />
      </div>
    </section>
  );
}

export function Chip({ value }: { value: string }) {
  return <span className={`chip ${chipTone(value)}`}>{label(value)}</span>;
}

export function StatCard({
  label: l,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="crmStat">
      <span>{l}</span>
      <b>{value}</b>
      {note && <small>{note}</small>}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="crmPanel">
      <div className="crmPanelHead">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ message }: { message: string }) {
  return <div className="crmEmpty">{message}</div>;
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="formError crmError" role="alert">
      {message}
    </p>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    // Move focus into the dialog so keyboard users land on the form.
    dialogRef.current
      ?.querySelector<HTMLElement>("input, select, textarea, button")
      ?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="crmModal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        aria-label={title}
        aria-modal="true"
        className="crmModalCard"
        ref={dialogRef}
        role="dialog"
      >
        <div className="crmModalHead">
          <h3>{title}</h3>
          <button
            aria-label="Close"
            className="crmClose"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label: l,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="crmField">
      <span>{l}</span>
      {children}
    </label>
  );
}

export function CancelButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="btn ghost small"
      onClick={onClick}
      type="button"
    >
      Cancel
    </button>
  );
}
