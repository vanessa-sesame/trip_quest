"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Download, LoaderCircle, PackageCheck, Printer, RefreshCw, Truck } from "lucide-react";
import { KIT_SHIPS_WITHIN_DAYS } from "../lib/products";

// The owner's kit queue (see app/api/orders/route.ts): print the booklet,
// sticker sheets and packing slip for each paid kit, then mark it printed
// and shipped.

type Order = {
  id: string;
  reference: string;
  createdAt: number;
  amountCents: number;
  currency: string;
  fulfilmentStatus: "new" | "printed" | "shipped";
  shipping: {
    name: string;
    phone: string;
    email: string;
    address: { line1: string; line2: string; city: string; postalCode: string; country: string };
  } | null;
  edition: string;
  trip: { destination: string; age: number; days: number; children: Array<{ name: string; age: number }> } | null;
};

const statusLabels: Record<Order["fulfilmentStatus"], string> = {
  new: "To print",
  printed: "Printed",
  shipped: "Shipped",
};

function workingDaysSince(timestamp: number) {
  let days = 0;
  const day = new Date(timestamp);
  const today = new Date();
  while (day < today) {
    day.setDate(day.getDate() + 1);
    if (day <= today && day.getDay() !== 0 && day.getDay() !== 6) days += 1;
  }
  return days;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [filter, setFilter] = useState<"open" | "all">("open");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/orders", { cache: "no-store", headers: { Accept: "application/json" } });
      const payload = (await response.json()) as { orders?: Order[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Orders could not be loaded.");
      setOrders(payload.orders ?? []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Orders could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Loading orders is the page's one job; it runs once on open.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function mark(order: Order, status: Order["fulfilmentStatus"]) {
    setSaving(order.id);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ id: order.id, status }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "The order could not be updated.");
      setOrders((current) => current?.map((item) => (item.id === order.id ? { ...item, fulfilmentStatus: status } : item)) ?? null);
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : "The order could not be updated.");
    } finally {
      setSaving("");
    }
  }

  const visible = (orders ?? []).filter((order) => filter === "all" || order.fulfilmentStatus !== "shipped");
  const counts = {
    new: (orders ?? []).filter((order) => order.fulfilmentStatus === "new").length,
    printed: (orders ?? []).filter((order) => order.fulfilmentStatus === "printed").length,
  };

  return (
    <main className="orders-page">
      <header className="orders-header">
        <div>
          <p className="eyebrow">TripQuest kits</p>
          <h1>Orders to print and post</h1>
          <p className="modal-subtitle">
            {orders
              ? `${counts.new} to print · ${counts.printed} to post · kits ship within ${KIT_SHIPS_WITHIN_DAYS} working days`
              : "Paid explorer kits, newest first."}
          </p>
          <p className="orders-header-links">
            <Link href="/library">All generated booklets and their files</Link>
            <Link href="/">Back to the studio</Link>
          </p>
        </div>
        <div className="orders-actions">
          <button className="secondary-button" type="button" onClick={() => setFilter(filter === "open" ? "all" : "open")}>
            {filter === "open" ? "Show shipped too" : "Hide shipped"}
          </button>
          <button className="icon-button" type="button" aria-label="Reload orders" onClick={() => void load()}>
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      {error ? <p className="form-error" role="alert">{error}{/owner/i.test(error) ? <> <a href="/owner">Sign in as owner</a></> : null}</p> : null}
      {loading && !orders ? (
        <p className="orders-empty"><LoaderCircle className="spin" size={18} /> Loading orders…</p>
      ) : null}
      {orders && !visible.length ? <p className="orders-empty">No kits waiting. New paid kits appear here.</p> : null}

      <ul className="orders-list">
        {visible.map((order) => {
          const waiting = workingDaysSince(order.createdAt);
          const late = order.fulfilmentStatus !== "shipped" && waiting > KIT_SHIPS_WITHIN_DAYS;
          const children = order.trip?.children.map((child) => `${child.name || "Explorer"} (${child.age})`).join(", ");
          const file = (kind: string) => `/api/orders?id=${encodeURIComponent(order.id)}&file=${kind}`;
          return (
            <li key={order.id} className="order-card">
              <div className="order-card-top">
                <div>
                  <strong>{order.trip ? `${order.trip.destination} · ${order.trip.days} days · age ${order.trip.age}` : "Trip details unavailable"}</strong>
                  <span>
                    #{order.reference} · {new Date(order.createdAt).toLocaleDateString("en-SG", { day: "numeric", month: "short" })}
                    {order.edition ? ` · edition ${order.edition}` : ""}
                    {children ? ` · ${children}` : ""}
                  </span>
                </div>
                <span className={`order-status order-status-${order.fulfilmentStatus}${late ? " order-status-late" : ""}`}>
                  {statusLabels[order.fulfilmentStatus]}
                  {late ? ` · ${waiting} working days` : ""}
                </span>
              </div>
              <address className="order-address">
                {order.shipping ? (
                  <>
                    {order.shipping.name}<br />
                    {order.shipping.address.line1}<br />
                    {order.shipping.address.line2 ? <>{order.shipping.address.line2}<br /></> : null}
                    {order.shipping.address.country === "SG" ? "Singapore" : order.shipping.address.country} {order.shipping.address.postalCode}<br />
                    {[order.shipping.phone, order.shipping.email].filter(Boolean).join(" · ")}
                  </>
                ) : (
                  "No shipping address was saved: check this payment in Stripe."
                )}
              </address>
              <div className="order-buttons">
                <a className="secondary-button" href={`${file("booklet")}&print=1`} download title="A5 with 3mm bleed, for the print shop"><Download size={16} /> Booklet (print shop)</a>
                <a className="secondary-button" href={`${file("parent-guide")}&print=1`} download title="A5 with 3mm bleed, for the print shop"><Download size={16} /> Parent guide (print shop)</a>
                <a className="secondary-button" href={file("stickers")} download><Download size={16} /> Stickers</a>
                <a className="secondary-button" href={file("envelope")} download title="A6 postcard and next-adventure card, printed double-sided"><Download size={16} /> Envelope inserts</a>
                <a className="secondary-button" href={file("booklet")} download title="Exact A5 pages, as the customer sees them"><Download size={16} /> Booklet (A5)</a>
                <a className="secondary-button" href={file("slip")} download><Download size={16} /> Packing slip</a>
                {order.fulfilmentStatus === "new" ? (
                  <button className="primary-button" type="button" disabled={saving === order.id} onClick={() => void mark(order, "printed")}>
                    <Printer size={16} /> Mark printed
                  </button>
                ) : null}
                {order.fulfilmentStatus === "printed" ? (
                  <button className="primary-button" type="button" disabled={saving === order.id} onClick={() => void mark(order, "shipped")}>
                    <Truck size={16} /> Mark shipped
                  </button>
                ) : null}
                {order.fulfilmentStatus === "shipped" ? (
                  <span className="order-done"><PackageCheck size={16} /> Posted</span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
