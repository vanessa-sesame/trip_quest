import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, KIT_SHIPS_WITHIN_DAYS, PRODUCTS } from "../lib/products";

export const metadata: Metadata = {
  title: "Shipping, refunds and privacy · TripQuest Kids",
  description: "How TripQuest Kids explorer kits are posted, refunded and how your details are used.",
};

// Shipping, refunds, terms and privacy in one page: what a parent checks
// before paying, and what Stripe reviews before accepting live payments.
export default function Policies() {
  const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
  return (
    <main className="orders-page policies-page">
      <header className="orders-header">
        <div>
          <p className="eyebrow">TripQuest Kids</p>
          <h1>Shipping, refunds and privacy</h1>
          <p className="modal-subtitle">Questions about an order? Write to {mail} and we will reply within two working days.</p>
        </div>
        <Link className="secondary-button" href="/">Back to TripQuest</Link>
      </header>

      <nav className="policies-nav" aria-label="On this page">
        <a href="#what-we-sell">What we sell</a>
        <a href="#shipping">Shipping</a>
        <a href="#refunds">Refunds and cancellations</a>
        <a href="#terms">Terms</a>
        <a href="#privacy">Privacy</a>
        <a href="#contact">Contact</a>
      </nav>

      <section id="what-we-sell">
        <h2>What we sell</h2>
        <p>
          TripQuest Kids makes travel activity booklets matched to a child&apos;s age and a family&apos;s trip.
          The booklet PDF is free to download and print at home.
        </p>
        <p>
          The explorer kit costs {PRODUCTS.kit.priceLabel} (Singapore dollars, delivery within Singapore included). It contains the
          booklet printed in full colour on A5 paper, custom sticker sheets, a sealed mystery envelope, a parent guide with every
          answer, and mini coloured pencils in a zip pouch. Each kit is made for one booklet edition, the exact one you saw in
          the preview when you paid.
        </p>
      </section>

      <section id="shipping">
        <h2>Shipping</h2>
        <ul>
          <li>We post to addresses in Singapore only. Delivery is included in the price.</li>
          <li>
            Every kit is printed to order. We post it within {KIT_SHIPS_WITHIN_DAYS} working days of payment, and it usually
            arrives 1 to 3 working days after that by local post.
          </li>
          <li>
            Travelling soon? Write to us before you order and we will tell you honestly whether the kit can reach you in time.
            The free booklet PDF is always available straight away.
          </li>
          <li>If your kit has not arrived 10 working days after we post it, write to us and we will trace it or send a new one.</li>
        </ul>
      </section>

      <section id="refunds">
        <h2>Refunds and cancellations</h2>
        <ul>
          <li>
            <strong>Before printing:</strong> cancel for a full refund by writing to {mail} with your order email. We confirm
            by email, and the refund goes back to the card or account you paid with.
          </li>
          <li>
            <strong>After printing:</strong> because each kit is personalised (your destination, your itinerary, your
            child&apos;s name), we cannot take change-of-mind cancellations once it has been printed.
          </li>
          <li>
            <strong>Damaged, missing or wrong:</strong> if the kit arrives damaged, with something missing, or not matching
            the booklet you ordered, email us within 14 days of delivery, with a photo if you can. We will send a replacement
            free of charge, or refund you in full if you prefer.
          </li>
          <li>
            <strong>Lost in the post:</strong> we send a replacement or refund you in full.
          </li>
          <li>Refunds usually reach your account within 5 to 10 working days, depending on your bank.</li>
        </ul>
      </section>

      <section id="terms">
        <h2>Terms</h2>
        <ul>
          <li>
            Booklets are written with the help of AI and checked against public sources about each place. Opening hours,
            prices and rules change: please check anything important (tickets, safety, access) with the venue before you go.
          </li>
          <li>
            Activities are designed to be done with a grown-up. Children should be supervised at all times, especially near
            roads, water and crowds.
          </li>
          <li>Booklets and kits are for your family&apos;s personal use. Please do not resell them.</li>
          <li>Payments are processed securely by Stripe. We never see or store your card details.</li>
        </ul>
      </section>

      <section id="privacy">
        <h2>Privacy</h2>
        <ul>
          <li>
            <strong>What you tell us:</strong> your destination, trip dates and itinerary, and (if you add them) your
            children&apos;s first names, ages and interests. We use these only to make your booklet.
          </li>
          <li>
            <strong>To make the booklet:</strong> your trip details and your children&apos;s ages and interests are sent to
            our AI and image providers (Anthropic and Cloudflare) to write and illustrate it. Names are never sent to them:
            we add them only when the PDF is drawn.
          </li>
          <li>
            <strong>When you order a kit:</strong> Stripe collects your name, delivery address, phone number and email. We use
            them only to post your kit and contact you about the order.
          </li>
          <li>
            <strong>Cookies:</strong> one cookie keeps your saved family profile and purchases on this device. We do not use
            advertising or tracking cookies.
          </li>
          <li>We never sell your details or share them for marketing.</li>
          <li>To see, correct or delete what we hold about you, write to {mail}.</li>
        </ul>
      </section>

      <section id="contact">
        <h2>Contact</h2>
        <p>
          TripQuest Kids, Singapore. Email {mail}: we reply within two working days.
        </p>
      </section>
    </main>
  );
}
