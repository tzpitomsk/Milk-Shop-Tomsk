"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Html5QrcodeScanner } from "html5-qrcode";

import Cart from "@/components/Cart";
import OrderSummary from "@/components/OrderSummary";


type CartItem = {
  id: number;
  name: string;
  price: number;
  quantity: number;
};


function NewOrderPage() {

  const searchParams = useSearchParams();
  const productFromCard = searchParams.get("product");


  const [cart, setCart] = useState<CartItem[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);

  const [customerId, setCustomerId] = useState("");
  const [search, setSearch] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanner, setScanner] = useState<any>(null);



  useEffect(() => {

    fetch("/api/products")
      .then(res => res.json())
      .then(data => {

        setProducts(data);


        if (productFromCard) {

          const product = data.find(
            (p: any) => p.id === Number(productFromCard)
          );


          if (product) {

            setCart([
              {
                id: product.id,
                name: product.name,
                price: product.price,
                quantity: 1,
              }
            ]);

          }

        }

      });

  }, [productFromCard]);





  useEffect(() => {

    fetch("/api/customers")
      .then(res => res.json())
      .then(data => setCustomers(data));

  }, []);





  const filteredProducts = useMemo(() => {

    const value = search.toLowerCase().trim();


    return products.filter(product =>

      product.name
        .toLowerCase()
        .includes(value)

      ||

      (
        product.barcode &&
        product.barcode
          .toLowerCase()
          .includes(value)
      )

    );


  }, [products, search]);







  function addProduct(id: number) {

    const product = products.find(
      p => p.id === id
    );

    if (!product) return;

    // Сколько этого товара уже лежит в корзине
    const cartItem = cart.find(
      item => item.id === id
    );

    const currentQuantity = cartItem ? cartItem.quantity : 0;

    // Проверяем реальный остаток по партиям
    const realStock = product.batches
      ? product.batches.reduce(
        (sum: number, batch: any) =>
          sum + batch.quantity,
        0
      )
      : product.stock;


    if (currentQuantity >= realStock) {

      alert(
        `❌ На складе только ${realStock} ${product.unit}`
      );

      return;
    }

    setCart(current => {

      const existing = current.find(
        item => item.id === id
      );

      if (existing) {

        return current.map(item =>

          item.id === id
            ? {
              ...item,
              quantity: item.quantity + 1
            }
            : item

        );

      }

      return [

        ...current,

        {
          id: product.id,
          name: product.name,
          price: product.price,
          quantity: 1
        }

      ];

    });

  }






  function removeProduct(id: number) {


    setCart(current =>

      current

        .map(item =>

          item.id === id

            ?

            {
              ...item,
              quantity: item.quantity - 1
            }

            :

            item

        )

        .filter(item => item.quantity > 0)

    );


  }








  function startScanner() {

    setScannerOpen(true);


    setTimeout(() => {


      const newScanner = new Html5QrcodeScanner(

        "reader",

        {
          fps: 10,

          qrbox: {
            width: 250,
            height: 150
          },

          rememberLastUsedCamera: true
        },

        false

      );


      setScanner(newScanner);



      newScanner.render(

        (decodedText) => {


          const product = products.find(

            p => p.barcode === decodedText

          );



          if (product) {

            addProduct(product.id);

          }
          else {

          }


        },


        () => { }

      );


    }, 300);


  }








  const total = cart.reduce(

    (sum, item) =>

      sum + item.price * item.quantity,

    0

  );









  async function saveOrder() {


    if (cart.length === 0) {

      alert("Корзина пустая");

      return;

    }





    const res = await fetch(

      "/api/orders",

      {

        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },


        body: JSON.stringify({

          items: cart,

          total,


          customerId:

            customerId

              ?

              Number(customerId)

              :

              null


        })

      }

    );





    if (!res.ok) {

      alert("Ошибка сохранения заказа");

      return;

    }





    alert("✅ Заказ сохранен");


    setCart([]);

    setCustomerId("");


  }









  return (

    <main className="min-h-screen bg-slate-100 p-4">


      <div className="mx-auto max-w-md">



        <h1 className="mb-6 text-3xl font-bold text-green-700">

          🛒 Новый заказ

        </h1>





        <select

          value={customerId}

          onChange={
            e => setCustomerId(e.target.value)
          }

          className="mb-4 w-full rounded-xl border bg-white p-3"

        >

          <option value="">

            Без клиента

          </option>



          {
            customers.map(customer =>

              <option

                key={customer.id}

                value={customer.id}

              >

                {customer.name}

              </option>

            )
          }


        </select>







        <input

          value={search}

          onChange={
            e => setSearch(e.target.value)
          }

          placeholder="🔍 Название или штрихкод"

          className="mb-4 w-full rounded-xl border bg-white p-3"

        />







        {!scannerOpen && (


          <button

            onClick={startScanner}

            className="
            mb-4
            w-full
            rounded-xl
            bg-blue-600
            py-3
            font-bold
            text-white
            "

          >

            📷 Сканировать штрихкод

          </button>


        )}







        {scannerOpen && (


          <div className="mb-4 rounded-xl bg-white p-3">


            <div

              id="reader"

              className="overflow-hidden rounded-xl"

            />



            <button

              onClick={() => {

                if (scanner) {

                  scanner.clear();

                  setScanner(null);

                }

                setScannerOpen(false);

              }}

              className="
  mt-3
  w-full
  rounded-xl
  bg-red-600
  py-3
  font-bold
  text-white
  "

            >

              ❌ Закрыть сканер

            </button>

          </div>


        )}








        <div className="space-y-3">


          {

            filteredProducts.map(product =>


              <div

                key={product.id}

                className="
                flex
                items-center
                justify-between
                rounded-xl
                bg-white
                p-4
                shadow
                "

              >



                <div>

                  <div className="font-semibold">
                    {product.name}
                  </div>

                  <div className="text-gray-500">
                    {product.price} ₽
                  </div>

                  <div
                    className={
                      product.stock <= 5
                        ? "text-sm text-red-600"
                        : "text-sm text-gray-500"
                    }
                  >
                    Остаток: {product.stock} {product.unit}
                  </div>

                </div>





                <button

                  onClick={() => addProduct(product.id)}

                  className="
  rounded-xl
  bg-green-700
  px-4
  py-2
  text-white
  "

                >

                  Добавить

                </button>


              </div>


            )

          }


        </div>







        <div className="mt-8 space-y-5">


          <Cart

            items={cart}

            onAdd={addProduct}

            onRemove={removeProduct}

          />



          <OrderSummary

            total={total}

            onSave={saveOrder}

          />


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
      <NewOrderPage />
    </Suspense>
  );
}