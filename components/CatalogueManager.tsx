// components/CatalogueManager.tsx
// Shared catalogue management UI, used by /admin/catalogue (with loader)
// and /store/catalogue (without loader).
"use client";

import { useEffect, useState, useCallback } from "react";
import { CatalogueItem, ItemCategory } from "@/lib/types";
import { groupByParent, ParentGroup, CATEGORIES } from "@/lib/catalogueGrouping";
import {
  fetchCatalogue,
  catalogueCount,
  bulkLoadCatalogue,
  renameParent,
  setParentActive,
  setVariantActive,
  addVariant,
  addParentWithFirstVariant,
} from "@/lib/data/catalogueApi";

const DEPT = "endo";

export default function CatalogueManager({ allowLoader }: { allowLoader: boolean }) {
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState(0);
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [list, n] = await Promise.all([fetchCatalogue(DEPT), catalogueCount(DEPT)]);
    setItems(list);
    setCount(n);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) {
    return <p className="text-sm text-slate-400">Loading catalogue…</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
            Catalogue · Endodontics
          </h1>
          <p className="mt-1 text-slate-400">
            {count === 0
              ? "No items loaded yet."
              : `${count} items across ${groupByParent(items).length} parent groups.`}
          </p>
        </div>
        {count > 0 && (
          <button
            onClick={() => setAdding((a) => !a)}
            className="rounded-lg bg-emerald px-5 py-2 text-sm font-semibold text-(--color-navy) transition hover:bg-(--color-emerald-soft)"
          >
            {adding ? "Cancel" : "+ New parent group"}
          </button>
        )}
      </div>

      {adding && (
        <NewParentCard
          onDone={() => {
            setAdding(false);
            refresh();
          }}
        />
      )}

      {count === 0 ? (
        allowLoader ? (
          <LoaderCard onLoaded={refresh} />
        ) : (
          <section className="glass rounded-3xl p-8">
            <p className="text-slate-300">
              The catalogue hasn't been loaded yet. Ask an admin to load the starter catalogue.
            </p>
          </section>
        )
      ) : (
        <CatalogueList groups={groupByParent(items)} onChanged={refresh} />
      )}
    </div>
  );
}

function LoaderCard({ onLoaded }: { onLoaded: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function load() {
    setBusy(true);
    setErr("");
    setMsg("Fetching starter catalogue…");
    try {
      const res = await fetch("/catalogue-endo.json");
      if (!res.ok) throw new Error("Couldn't read catalogue-endo.json");
      const items: CatalogueItem[] = await res.json();
      setMsg(`Loading ${items.length} items into Firestore…`);
      const written = await bulkLoadCatalogue(items);
      setMsg(`Loaded ${written} items.`);
      onLoaded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed.");
      setMsg("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass rounded-3xl p-8">
      <p className="mb-2 text-[11px] uppercase tracking-[3px] text-emerald/70">
        One-time load
      </p>
      <h2 className="mb-3 text-2xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
        Load the starter catalogue
      </h2>
      <p className="mb-6 max-w-xl leading-relaxed text-slate-300">
        This loads 244 Endodontics items collapsed into 71 parent groups. You can rename
        groups, hide items, and add new ones afterward — nothing here is permanent. Safe to
        re-run; it overwrites rather than duplicating.
      </p>
      {msg && <p className="mb-4 rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-300">{msg}</p>}
      {err && <p className="mb-4 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{err}</p>}
      <button
        onClick={load}
        disabled={busy}
        className="rounded-lg bg-emerald px-8 py-2.5 text-sm font-semibold text-(--color-navy) transition hover:bg-(--color-emerald-soft) disabled:opacity-60"
      >
        {busy ? "Loading…" : "Load starter catalogue"}
      </button>
    </section>
  );
}

const inputCls =
  "rounded-lg border border-white/15 bg-(--color-navy) px-3 py-2 text-sm text-white outline-none focus:border-emerald/60";

function NewParentCard({ onDone }: { onDone: () => void }) {
  const [parentName, setParentName] = useState("");
  const [category, setCategory] = useState<ItemCategory>("Consumable");
  const [subcategory, setSubcategory] = useState("");
  const [variantName, setVariantName] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [unit, setUnit] = useState("piece");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!parentName.trim() || !variantName.trim()) {
      setErr("Group name and first item name are required.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await addParentWithFirstVariant({
        departmentId: DEPT,
        parentName,
        category,
        subcategory,
        variantName,
        itemCode,
        unit,
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't create the group.");
      setBusy(false);
    }
  }

  return (
    <section className="glass rounded-3xl p-6">
      <h2 className="mb-1 text-xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
        New parent group
      </h2>
      <p className="mb-5 text-sm text-slate-400">
        A group is created together with its first item — groups can't be empty.
      </p>
      {err && <p className="mb-4 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{err}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          className={inputCls}
          placeholder="Group name (e.g. Bioceramic Sealers)"
          value={parentName}
          onChange={(e) => setParentName(e.target.value)}
        />
        <select
          className={inputCls}
          value={category}
          onChange={(e) => setCategory(e.target.value as ItemCategory)}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          className={inputCls}
          placeholder="Subcategory (e.g. Obturation)"
          value={subcategory}
          onChange={(e) => setSubcategory(e.target.value)}
        />
        <input
          className={inputCls}
          placeholder="Unit (box / piece / syringe …)"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        />
        <input
          className={inputCls}
          placeholder="First item name (e.g. BC Sealer 2g syringe)"
          value={variantName}
          onChange={(e) => setVariantName(e.target.value)}
        />
        <input
          className={inputCls}
          placeholder="Hospital code (optional)"
          value={itemCode}
          onChange={(e) => setItemCode(e.target.value)}
        />
      </div>
      <button
        onClick={save}
        disabled={busy}
        className="mt-5 rounded-lg bg-emerald px-8 py-2.5 text-sm font-semibold text-(--color-navy) transition hover:bg-(--color-emerald-soft) disabled:opacity-60"
      >
        {busy ? "Creating…" : "Create group"}
      </button>
    </section>
  );
}

function CatalogueList({ groups, onChanged }: { groups: ParentGroup[]; onChanged: () => void }) {
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <ParentRow key={g.parentId} group={g} onChanged={onChanged} />
      ))}
    </div>
  );
}

function ParentRow({ group, onChanged }: { group: ParentGroup; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.parentName);
  const [busy, setBusy] = useState(false);

  async function saveName() {
    if (!name.trim() || name === group.parentName) {
      setEditing(false);
      setName(group.parentName);
      return;
    }
    setBusy(true);
    await renameParent(DEPT, group.parentId, name);
    setBusy(false);
    setEditing(false);
    onChanged();
  }

  async function toggleParent() {
    setBusy(true);
    await setParentActive(DEPT, group.parentId, !group.anyActive);
    setBusy(false);
    onChanged();
  }

  return (
    <section className={`glass rounded-2xl p-4 ${group.anyActive ? "" : "opacity-50"}`}>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/15 text-slate-300 transition hover:text-white"
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? "−" : "+"}
        </button>

        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
              className="w-full rounded-lg border border-emerald/50 bg-(--color-navy) px-2 py-1 text-sm text-white outline-none"
            />
          ) : (
            <button onClick={() => setEditing(true)} className="text-left">
              <span className="font-medium text-white">{group.parentName}</span>
              <span className="ml-2 text-xs text-slate-500">
                {group.variants.length} {group.variants.length === 1 ? "item" : "items"}
              </span>
            </button>
          )}
          <p className="text-[11px] uppercase tracking-wide text-slate-500">
            {group.category} · {group.subcategory}
          </p>
        </div>

        <button
          onClick={toggleParent}
          disabled={busy}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition disabled:opacity-50 ${
            group.anyActive
              ? "bg-emerald/15 text-emerald"
              : "bg-white/10 text-slate-400"
          }`}
        >
          {group.anyActive ? "Active" : "Hidden"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-1 border-t border-white/10 pt-3 pl-10">
          {group.variants.map((v) => (
            <VariantRow key={v.id} variant={v} onChanged={onChanged} />
          ))}
          <AddVariantRow group={group} onChanged={onChanged} />
        </div>
      )}
    </section>
  );
}

function AddVariantRow({ group, onChanged }: { group: ParentGroup; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [variantName, setVariantName] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [unit, setUnit] = useState(group.variants[0]?.unit ?? "piece");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!variantName.trim()) {
      setErr("Item name is required.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await addVariant({
        departmentId: DEPT,
        parentId: group.parentId,
        parentName: group.parentName,
        category: group.category,
        subcategory: group.subcategory,
        variantName,
        itemCode,
        unit,
      });
      setVariantName("");
      setItemCode("");
      setOpen(false);
      setBusy(false);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't add the item.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-1 text-xs font-semibold text-emerald transition hover:text-(--color-emerald-soft)"
      >
        + Add variant
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-white/10 p-3">
      {err && <p className="mb-2 rounded-lg bg-red-500/15 px-3 py-1.5 text-xs text-red-300">{err}</p>}
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          className={inputCls}
          placeholder="Item name (e.g. Size 25/.04)"
          value={variantName}
          onChange={(e) => setVariantName(e.target.value)}
          autoFocus
        />
        <input
          className={inputCls}
          placeholder="Hospital code (optional)"
          value={itemCode}
          onChange={(e) => setItemCode(e.target.value)}
        />
        <input
          className={inputCls}
          placeholder="Unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        />
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-emerald px-5 py-1.5 text-xs font-semibold text-(--color-navy) transition hover:bg-(--color-emerald-soft) disabled:opacity-60"
        >
          {busy ? "Adding…" : "Add item"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setErr("");
          }}
          className="rounded-lg border border-white/15 px-5 py-1.5 text-xs text-slate-300 transition hover:text-white"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function VariantRow({ variant, onChanged }: { variant: CatalogueItem; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    await setVariantActive(variant.id, !variant.active);
    setBusy(false);
    onChanged();
  }
  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 ${variant.active ? "" : "opacity-50"}`}>
      <div className="min-w-0">
        <span className="text-sm text-slate-200">{variant.variantName}</span>
        {variant.itemCode && (
          <span className="ml-2 text-xs text-slate-500">#{variant.itemCode}</span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs text-slate-500">{variant.unit}</span>
        <button
          onClick={toggle}
          disabled={busy}
          className={`rounded-full px-2 py-0.5 text-xs transition disabled:opacity-50 ${
            variant.active ? "bg-emerald/15 text-emerald" : "bg-white/10 text-slate-400"
          }`}
        >
          {variant.active ? "On" : "Off"}
        </button>
      </div>
    </div>
  );
}