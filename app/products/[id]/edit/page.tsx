"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";


export default function EditProductPage() {

    const params = useParams();
    const router = useRouter();

    const id = params.id;


    const [name, setName] = useState("");
    const [barcode, setBarcode] = useState("");
    const [unit, setUnit] = useState("шт");
    const [price, setPrice] = useState("");
    const [cost, setCost] = useState("");


    useEffect(() => {

        async function loadProduct() {

            const res = await fetch(`/api/products/${id}/details`);

            const data = await res.json();


            setName(data.name);
            setBarcode(data.barcode || "");
            setUnit(data.unit);
            setPrice(String(data.price));
            setCost(String(data.cost));

        }


        loadProduct();

    }, [id]);




    async function saveProduct() {


        await fetch(`/api/products/${id}`, {

            method: "PUT",

            headers: {
                "Content-Type": "application/json",
            },


            body: JSON.stringify({

                name,
                barcode,
                unit,
                price: Number(price),
                cost: Number(cost),

            }),

        });


        router.push(`/products/${id}`);

    }




    return (

        <main className="min-h-screen bg-slate-100 p-4">


            <div className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow">


                <h1 className="mb-6 text-3xl font-bold text-green-700">

                    ✏️ Изменить товар

                </h1>



                <input

                    className="mb-4 w-full rounded-xl border p-3"

                    placeholder="Название"

                    value={name}

                    onChange={(e) => setName(e.target.value)}

                />



                <input

                    className="mb-4 w-full rounded-xl border p-3"

                    placeholder="Штрихкод"

                    value={barcode}

                    onChange={(e) => setBarcode(e.target.value)}

                />



                <input

                    className="mb-4 w-full rounded-xl border p-3"

                    placeholder="Единица"

                    value={unit}

                    onChange={(e) => setUnit(e.target.value)}

                />



                <input

                    type="number"

                    className="mb-4 w-full rounded-xl border p-3"

                    placeholder="Цена продажи"

                    value={price}

                    onChange={(e) => setPrice(e.target.value)}

                />



                <input

                    type="number"

                    className="mb-6 w-full rounded-xl border p-3"

                    placeholder="Себестоимость"

                    value={cost}

                    onChange={(e) => setCost(e.target.value)}

                />




                <button

                    onClick={saveProduct}

                    className="w-full rounded-xl bg-green-700 py-3 font-bold text-white"

                >

                    💾 Сохранить

                </button>



            </div>


        </main>

    );

}