"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";


export default function ProductHistoryPage() {


  const { id } = useParams();
  const router = useRouter();


  const [movements, setMovements] = useState<any[]>([]);
  const [product, setProduct] = useState<any>(null);



  useEffect(() => {

    loadData();

  }, []);




  async function loadData() {


    const movementsRes = await fetch(
      `/api/products/${id}/movements`
    );


    const movementsData =
      await movementsRes.json();


    setMovements(movementsData);



    const productRes = await fetch(
      `/api/products/${id}`
    );


    const productData =
      await productRes.json();


    setProduct(productData);


  }







  if (!product) {


    return (

      <main className="min-h-screen bg-slate-100 flex items-center justify-center">

        Загрузка...

      </main>

    );

  }







  return (

    <main className="min-h-screen bg-slate-100 p-5">


      <div className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow">



        <h1 className="mb-2 text-3xl font-bold text-green-700">

          📦 {product.name}

        </h1>





        <div className="mb-6 text-gray-600">

          Остаток:

          {" "}

          <b>

            {product.stock} {product.unit}

          </b>


        </div>







        <h2 className="mb-4 text-xl font-bold">

          📜 История движения

        </h2>







        {movements.length === 0 && (

          <p className="text-gray-500">

            История пустая

          </p>

        )}







        <div className="space-y-3">



          {movements.map((move) => {



            const isSale =
              move.type === "SALE";

            const isWriteOff =
              move.type === "WRITE_OFF";



            return (


              <div

                key={move.id}

                className={`
                rounded-xl
                border
                p-4
                ${isSale
                    ? "bg-red-50 border-red-200"
                    : isWriteOff
                      ? "bg-orange-50 border-orange-200"
                      : "bg-green-50 border-green-200"
                  }
                `}

              >




                <div className="flex justify-between items-center">


                  <span className="font-bold">

                    {move.type === "SALE"

                      ?

                      "🔴 ПРОДАЖА"

                      :

                      move.type === "SUPPLY"

                        ?

                        "🟢 ПРИХОД"

                        :

                        move.type === "WRITE_OFF"

                          ?

                          "🗑 СПИСАНИЕ"

                          :

                          move.type

                    }

                  </span>





                  <span

                    className={`
                    font-bold
                    ${move.quantity < 0
                        ? "text-red-600"
                        : "text-green-600"
                      }
                    `}

                  >


                    {move.quantity > 0 ? "+" : ""}

                    {move.quantity}

                    {" "}

                    {product.unit}


                  </span>



                </div>







                <div className="mt-2 text-gray-600">

                  {move.comment}

                </div>






                <div className="mt-1 text-sm text-gray-400">


                  {new Date(move.createdAt)
                    .toLocaleDateString("ru-RU")}


                </div>




              </div>


            );


          })}



        </div>








        <button

          onClick={() => router.back()}

          className="
          mt-6
          w-full
          rounded-xl
          bg-gray-200
          py-3
          font-bold
          "

        >

          ⬅️ Назад

        </button>




      </div>


    </main>

  );


}