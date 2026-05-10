"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { wsGet } from "@/lib/workspace/client";
import type { AcademyCertificate, ProductWithEnrollment } from "@/types/academy";

export default function CertificatePage() {
  const { product: slug } = useParams<{ product: string }>();
  const [cert,    setCert]    = useState<AcademyCertificate | null>(null);
  const [product, setProduct] = useState<ProductWithEnrollment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    wsGet<{ products: ProductWithEnrollment[] }>("/api/academy/products")
      .then(d => {
        const p = d.products.find(x => x.slug === slug || x.id === slug) ?? null;
        setProduct(p);
        setCert(p?.certificate ?? null);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <div className="min-h-screen bg-[#0c0c0f] flex items-center justify-center"><div className="text-white/40">Loading…</div></div>;

  if (!cert) {
    return (
      <div className="min-h-screen bg-[#0c0c0f] flex flex-col items-center justify-center px-6">
        <div className="text-6xl mb-4">🔒</div>
        <h2 className="text-xl font-bold text-white mb-2">Certificate not yet earned</h2>
        <p className="text-white/50 text-sm mb-6">Complete the course to unlock your certificate.</p>
        <Link href={`/academy/${slug}/learn`} className="bg-orange-500 hover:bg-orange-400 text-white font-semibold px-6 py-3 rounded-xl">
          Continue Learning
        </Link>
      </div>
    );
  }

  const issuedDate = new Date(cert.issued_at).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/certificates/${cert.certificate_number}`
    : "";

  return (
    <div className="min-h-screen bg-[#0c0c0f] flex flex-col items-center justify-center px-6 py-12">
      <Link href={`/academy/${slug}/learn`} className="text-sm text-white/40 hover:text-white/60 mb-8 self-start max-w-2xl w-full">
        ← Back to course
      </Link>

      {/* Certificate card */}
      <div className="w-full max-w-2xl bg-gradient-to-br from-gray-900 via-gray-900 to-indigo-950 border border-white/10 rounded-3xl p-10 text-center shadow-2xl mb-8">
        <div className="text-4xl mb-4">🏆</div>
        <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-2">Certificate of Completion</p>
        <p className="text-white/60 text-sm mb-6">This certifies that</p>
        <div className="text-2xl font-bold text-white mb-2 pb-2 border-b border-white/10">
          {/* Name shown from auth — placeholder here */}
          [Your Name]
        </div>
        <p className="text-white/60 text-sm mt-4 mb-2">has successfully completed</p>
        <h2 className="text-xl font-bold text-white mb-6">{product?.name}</h2>
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="h-px flex-1 bg-white/10" />
          <svg viewBox="0 0 40 40" className="w-8 h-8 text-orange-400" fill="currentColor">
            <path d="M20 2l4.9 9.9L36 13.5l-8 7.8 1.9 11-9.9-5.2-9.9 5.2L12 21.3 4 13.5l11.1-1.6z"/>
          </svg>
          <div className="h-px flex-1 bg-white/10" />
        </div>
        <p className="text-white/40 text-xs mt-4">Issued {issuedDate}</p>
        <p className="text-white/25 text-[10px] mt-1 font-mono">{cert.certificate_number}</p>
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        {cert.pdf_url && (
          <a href={cert.pdf_url} target="_blank" rel="noreferrer"
            className="bg-orange-500 hover:bg-orange-400 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors flex items-center gap-2">
            ⬇ Download PDF
          </a>
        )}
        <button
          onClick={() => { navigator.clipboard.writeText(shareUrl); }}
          className="bg-white/8 hover:bg-white/12 text-white font-medium px-6 py-3 rounded-xl text-sm transition-colors">
          🔗 Copy share link
        </button>
      </div>
      <p className="text-white/25 text-xs mt-4">Share your achievement on LinkedIn</p>
    </div>
  );
}
