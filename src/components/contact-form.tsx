"use client";

import { useActionState } from "react";

import { submitLead } from "@/app/actions/leads";
import type { LeadActionResult } from "@/app/actions/leads";

const initialState: LeadActionResult = { ok: false, error: "" };

function Field({
  label,
  name,
  type = "text",
  required = true,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      <input name={name} type={type} required={required} />
    </label>
  );
}

export function ContactForm() {
  const [state, formAction, pending] = useActionState(
    submitLead,
    initialState,
  );

  if (state.ok) {
    return (
      <div className="form" role="status">
        <h3>Thanks — we&rsquo;ve got it.</h3>
        <p className="lede">
          Your enquiry is in the queue. We&rsquo;ll reply within one business
          day, usually with a plan review or survey slot.
        </p>
      </div>
    );
  }

  return (
    <form className="form" action={formAction}>
      {/* Honeypot: invisible to humans, irresistible to bots. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hpField"
      />
      <Field label="Name" name="name" />
      <Field label="Email" name="email" type="email" />
      <Field label="Company (optional)" name="company" required={false} />
      <label>
        Project type
        <select name="projectType" defaultValue="">
          <option value="" disabled>
            Select one
          </option>
          <option>New build</option>
          <option>Existing site</option>
          <option>Managed support</option>
        </select>
      </label>
      <label>
        Project overview
        <textarea
          name="details"
          placeholder="Tell us about the building, timeline and current network."
        />
      </label>
      {state.error && (
        <p className="formError" role="alert">
          {state.error}
        </p>
      )}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? (
          "Sending…"
        ) : (
          <>
            Request a survey <span>→</span>
          </>
        )}
      </button>
      <p className="formNote">We will reply within one business day.</p>
    </form>
  );
}
