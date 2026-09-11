"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Product = {
  id: number;
  name: string;
  unit: string;
  price: number;
  cost: number;
  stock: number;
};

type Batch = {
  id: number;
  quantity: number;
  purchaseCost: number;
  receivedAt: string;
  expiryDate: string;
  status: string;
  productId: number;
  product: Product;
};

export default function BatchPage() {
  const params = useParams();
  const router = useRouter();

  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [batch, setBatch] = useState<Batch | null>(null);
  const [expiryDate, setExpiryDate] = useState("");

  const [writeOffQuantity, setWriteOffQuantity] = useState(0);
  const [writeOffReason, setWriteOffReason] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [writingOff, setWritingOff] = useState(false);
  const [error, setError] = useState("");

  // ===========================================================================
  // LOAD BATCH
  // ===========================================================================

  useEffect(() => {
    if (!id) return;


    loadBatch();


  }, [id]);

  async function loadBatch() {
    try {
      setLoading(true);
      setError("");


      const res = await fetch(`/api/batches/${id}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Ошибка загрузки партии");
      }

      setBatch(data);

      setExpiryDate(
        typeof data.expiryDate === "string"
          ? data.expiryDate.substring(0, 10)
          : ""
      );
    } catch (error) {
      console.error("LOAD BATCH ERROR:", error);

      setError(
        error instanceof Error
          ? error.message
          : "Ошибка загрузки партии"
      );
    } finally {
      setLoading(false);
    }


  }

  // ===========================================================================
  // SAVE BATCH
  //
  // Quantity is NOT editable.
  // We send the actual quantity received from the server.
  // The API will additionally verify that it has not changed.
  // ===========================================================================

  async function saveBatch() {
    if (!batch) return;


    if (!expiryDate) {
      alert("Укажите срок годности");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const res = await fetch(`/api/batches/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          quantity: batch.quantity,
          expiryDate,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Ошибка сохранения");
      }

      setBatch(data.batch);

      setExpiryDate(
        data.batch.expiryDate.substring(0, 10)
      );

      alert("✅ Партия сохранена");
    } catch (error) {
      console.error("SAVE BATCH ERROR:", error);

      alert(
        error instanceof Error
          ? error.message
          : "Ошибка сохранения"
      );

      await loadBatch();
    } finally {
      setSaving(false);
    }


  }

  // ===========================================================================
  // WRITE OFF BATCH
  // ===========================================================================

  async function writeOffBatch() {
    if (!batch) return;


    if (!Number.isInteger(writeOffQuantity) || writeOffQuantity <= 0) {
      alert("Введите корректное количество списания");
      return;
    }

    if (writeOffQuantity > batch.quantity) {
      alert(
        `Нельзя списать ${writeOffQuantity} ${batch.product.unit}. ` +
        `В партии доступно только ${batch.quantity} ${batch.product.unit}.`
      );
      return;
    }

    const reason = writeOffReason.trim() || "Списание";

    const ok = confirm(
      `Списать ${writeOffQuantity} ${batch.product.unit} ` +
      `из партии №${batch.id}?\n\n` +
      `Причина: ${reason}`
    );

    if (!ok) return;

    try {
      setWritingOff(true);
      setError("");

      const res = await fetch(
        `/api/batches/${id}/writeoff`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            quantity: writeOffQuantity,
            reason,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Ошибка списания");
      }

      alert(
        `🗑 Списано: ${data.data?.writeOff ?? writeOffQuantity
        } ${batch.product.unit}`
      );

      setWriteOffQuantity(0);
      setWriteOffReason("");

      await loadBatch();
    } catch (error) {
      console.error("WRITE OFF BATCH ERROR:", error);

      alert(
        error instanceof Error
          ? error.message
          : "Ошибка списания"
      );

      await loadBatch();
    } finally {
      setWritingOff(false);
    }


  }

  // ===========================================================================
  // STATUS DISPLAY
  // ===========================================================================

  function getStatusInfo(status: string) {
    switch (status) {
      case "ACTIVE":
        return {
          label: "Активна",
          className:
            "bg-green-100 text-green-800",
        };


      case "EXPIRED":
        return {
          label: "Просрочена",
          className:
            "bg-red-100 text-red-800",
        };

      case "EMPTY":
        return {
          label: "Пустая",
          className:
            "bg-gray-100 text-gray-700",
        };

      default:
        return {
          label: status,
          className:
            "bg-gray-100 text-gray-700",
        };
    }


  }

  // ===========================================================================
  // LOADING
  // ===========================================================================

  if (loading) {
    return (<main className="min-h-screen bg-slate-100 p-5"> <div className="mx-auto flex min-h-[50vh] max-w-md items-center justify-center"> <div className="rounded-2xl bg-white px-6 py-5 text-center shadow"> <div className="text-lg font-semibold">
      Загрузка партии... </div> </div> </div> </main>
    );
  }

  // ===========================================================================
  // ERROR
  // ===========================================================================

  if (error && !batch) {
    return (<main className="min-h-screen bg-slate-100 p-5"> <div className="mx-auto max-w-md"> <div className="rounded-2xl bg-white p-6 shadow"> <h1 className="mb-4 text-xl font-bold text-red-600">
      Ошибка </h1>


      <p className="mb-6 text-slate-700">
        {error}
      </p>

      <button
        onClick={loadBatch}
        className="w-full rounded-xl bg-green-700 py-3 font-bold text-white"
      >
        🔄 Повторить
      </button>

      <button
        onClick={() => router.back()}
        className="mt-3 w-full rounded-xl bg-gray-200 py-3 font-bold"
      >
        ⬅️ Назад
      </button>
    </div>
    </div>
    </main>
    );


  }

  if (!batch) {
    return null;
  }

  const statusInfo = getStatusInfo(batch.status);

  const isEmpty = batch.quantity === 0;

  // ===========================================================================
  // PAGE
  // ===========================================================================

  return (<main className="min-h-screen bg-slate-100 p-5"> <div className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow">
    {/* ================================================================= */}
    {/* HEADER */}
    {/* ================================================================= */}


    <div className="mb-6">
      <div className="mb-2 flex items-start justify-between gap-3">
        <h1 className="text-3xl font-bold text-green-700">
          🥛 {batch.product.name}
        </h1>

        <span
          className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${statusInfo.className}`}
        >
          {statusInfo.label}
        </span>
      </div>

      <div className="text-sm text-gray-500">
        Партия №{batch.id}
      </div>
    </div>

    <div className="space-y-5">
      {/* =============================================================== */}
      {/* QUANTITY — READ ONLY */}
      {/* =============================================================== */}

      <div>
        <label className="mb-2 block font-semibold">
          Количество партии
        </label>

        <div className="flex items-center justify-between rounded-xl border bg-gray-50 p-3">
          <span className="text-2xl font-bold">
            {batch.quantity}
          </span>

          <span className="text-gray-500">
            {batch.product.unit}
          </span>
        </div>

        <p className="mt-2 text-xs text-gray-500">
          Количество нельзя изменить редактированием партии.
          Остаток изменяется через приход, продажу, возврат
          или списание.
        </p>
      </div>

      {/* =============================================================== */}
      {/* EXPIRY DATE */}
      {/* =============================================================== */}

      <div>
        <label
          htmlFor="expiryDate"
          className="mb-2 block font-semibold"
        >
          Срок годности
        </label>

        <input
          id="expiryDate"
          type="date"
          value={expiryDate}
          onChange={(e) =>
            setExpiryDate(e.target.value)
          }
          disabled={saving || writingOff}
          className="w-full rounded-xl border p-3 disabled:bg-gray-100"
        />
      </div>

      {/* =============================================================== */}
      {/* PRODUCT INFO */}
      {/* =============================================================== */}

      <div className="rounded-xl bg-slate-50 p-4">
        <div className="flex justify-between gap-4">
          <span className="text-gray-600">
            Цена продажи
          </span>

          <span className="font-semibold">
            {batch.product.price} ₽
          </span>
        </div>

        <div className="mt-2 flex justify-between gap-4">
          <span className="text-gray-600">
            Себестоимость партии
          </span>

          <span className="font-semibold">
            {batch.purchaseCost} ₽
          </span>
        </div>

        <div className="mt-2 flex justify-between gap-4">
          <span className="text-gray-600">
            Остаток товара
          </span>

          <span className="font-semibold">
            {batch.product.stock}{" "}
            {batch.product.unit}
          </span>
        </div>
      </div>

      <hr />

      {/* =============================================================== */}
      {/* WRITE OFF */}
      {/* =============================================================== */}

      <div>
        <h2 className="mb-3 text-lg font-bold">
          🗑 Списание
        </h2>

        <label
          htmlFor="writeOffQuantity"
          className="mb-2 block font-semibold"
        >
          Количество списания
        </label>

        <input
          id="writeOffQuantity"
          type="number"
          min={1}
          max={batch.quantity}
          step={1}
          value={
            writeOffQuantity === 0
              ? ""
              : writeOffQuantity
          }
          onChange={(e) => {
            const value = e.target.value;

            if (value === "") {
              setWriteOffQuantity(0);
              return;
            }

            setWriteOffQuantity(
              Number(value)
            );
          }}
          placeholder={
            isEmpty
              ? "Партия пустая"
              : `Максимум ${batch.quantity}`
          }
          disabled={
            isEmpty ||
            saving ||
            writingOff
          }
          className="w-full rounded-xl border p-3 disabled:bg-gray-100"
        />

        <label
          htmlFor="writeOffReason"
          className="mb-2 mt-4 block font-semibold"
        >
          Причина списания
        </label>

        <input
          id="writeOffReason"
          value={writeOffReason}
          onChange={(e) =>
            setWriteOffReason(e.target.value)
          }
          placeholder="Например: Порча"
          disabled={
            isEmpty ||
            saving ||
            writingOff
          }
          className="w-full rounded-xl border p-3 disabled:bg-gray-100"
        />

        {isEmpty && (
          <p className="mt-2 text-sm text-gray-500">
            Партия уже пустая — списывать нечего.
          </p>
        )}
      </div>
    </div>

    {/* ================================================================= */}
    {/* SAVE */}
    {/* ================================================================= */}

    <button
      onClick={saveBatch}
      disabled={saving || writingOff}
      className="mt-6 w-full rounded-xl bg-green-700 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {saving ? "Сохранение..." : "💾 Сохранить срок годности"}
    </button>

    {/* ================================================================= */}
    {/* WRITE OFF */}
    {/* ================================================================= */}

    <button
      onClick={writeOffBatch}
      disabled={
        saving ||
        writingOff ||
        isEmpty ||
        writeOffQuantity <= 0 ||
        writeOffQuantity > batch.quantity
      }
      className="mt-3 w-full rounded-xl bg-red-600 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {writingOff
        ? "Списание..."
        : "🗑 Списать партию"}
    </button>

    {/* ================================================================= */}
    {/* BACK */}
    {/* ================================================================= */}

    <button
      onClick={() => router.back()}
      disabled={saving || writingOff}
      className="mt-3 w-full rounded-xl bg-gray-200 py-3 font-bold disabled:cursor-not-allowed disabled:opacity-50"
    >
      ⬅️ Назад
    </button>
  </div>
  </main>


  );
}