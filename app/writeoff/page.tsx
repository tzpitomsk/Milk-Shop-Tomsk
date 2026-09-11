"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";


function WriteOffPage() {

  const router = useRouter();
  const searchParams = useSearchParams();


  const [products, setProducts] = useState<any[]>([]);

  const [productId, setProductId] = useState("");

  const [batches, setBatches] = useState<any[]>([]);

  const [batchId, setBatchId] = useState("");

  const [quantity, setQuantity] = useState(1);

  const [reason, setReason] = useState("Просрочка");





  useEffect(() => {

    loadProducts();


    const product =
      searchParams.get("product");


    if (product) {

      setProductId(product);

      loadBatches(product);

    }


  }, []);






  async function loadProducts() {

    const res =
      await fetch("/api/products");


    const data =
      await res.json();


    setProducts(data);

  }







  async function loadBatches(id: string) {


    const res =
      await fetch(
        `/api/products/${id}/batches`
      );


    const data =
      await res.json();


    setBatches(data);


    if (data.length > 0) {

      setBatchId(
        String(data[0].id)
      );

    }


  }






  async function selectProduct(
    id: string
  ) {

    setProductId(id);

    setBatchId("");

    await loadBatches(id);

  }






  async function save() {


    if (!batchId) {

      alert("Выберите партию");

      return;

    }



    if (quantity <= 0) {

      alert("Введите количество");

      return;

    }




    const res =
      await fetch(
        `/api/batches/${batchId}/writeoff`,
        {

          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({

            quantity,

            reason,

          }),

        }

      );





    const data =
      await res.json();




    if (!res.ok) {

      alert(
        data.error ||
        "Ошибка списания"
      );

      return;

    }





    alert(
      `✅ Списано ${data.data.writeOff} шт`
    );


    router.push("/batches");

  }






  return (

    <main className="min-h-screen bg-slate-100 p-5">


      <div className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow">


        <h1 className="mb-6 text-3xl font-bold text-red-600">

          🗑 Списание товара

        </h1>





        <div className="space-y-5">





          <div>

            <label className="font-semibold">
              Товар
            </label>


            <select

              value={productId}

              onChange={
                e =>
                  selectProduct(
                    e.target.value
                  )
              }

              className="w-full rounded-xl border p-3"

            >

              <option value="">
                Выберите товар
              </option>


              {
                products.map(p => (

                  <option
                    key={p.id}
                    value={p.id}
                  >

                    {p.name}
                    {" "}
                    ({p.stock} {p.unit})

                  </option>

                ))
              }


            </select>


          </div>







          <div>

            <label className="font-semibold">
              Партия
            </label>


            <select

              value={batchId}

              onChange={
                e =>
                  setBatchId(
                    e.target.value
                  )
              }

              className="w-full rounded-xl border p-3"

            >


              <option value="">
                Выберите партию
              </option>



              {
                batches.map(b => (

                  <option
                    key={b.id}
                    value={b.id}
                  >

                    Партия №{b.id}
                    {" "}
                    — {b.quantity} шт
                    {" "}
                    до{" "}
                    {
                      new Date(
                        b.expiryDate
                      ).toLocaleDateString("ru-RU")
                    }


                  </option>

                ))
              }


            </select>


          </div>







          <div>

            <label className="font-semibold">
              Количество
            </label>


            <input

              type="number"

              min={1}

              value={quantity}

              onChange={
                e =>
                  setQuantity(
                    Number(e.target.value)
                  )
              }

              className="w-full rounded-xl border p-3"

            />


          </div>






          <div>

            <label className="font-semibold">
              Причина
            </label>


            <select

              value={reason}

              onChange={
                e =>
                  setReason(
                    e.target.value
                  )
              }

              className="w-full rounded-xl border p-3"

            >

              <option>
                Просрочка
              </option>

              <option>
                Бой
              </option>

              <option>
                Порча
              </option>

              <option>
                Инвентаризация
              </option>


            </select>


          </div>







          <button

            onClick={save}

            className="w-full rounded-xl bg-red-600 py-3 font-bold text-white"

          >

            🗑 Списать


          </button>






          <button

            onClick={() => router.back()}

            className="w-full rounded-xl bg-gray-200 py-3 font-bold"

          >

            ⬅️ Назад


          </button>



        </div>


      </div>


    </main>

  );


}


export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="p-5">
          Загрузка...
        </div>
      }
    >
      <WriteOffPage />
    </Suspense>
  );
}