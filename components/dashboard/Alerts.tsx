"use client";

import Link from "next/link";


type Props = {

  lowStock:number;
  emptyStock:number;
  expiredBatches:number;
  expiringSoon:number;


  lowStockProducts:{
    id:number;
    name:string;
    stock:number;
  }[];


  expiringProducts:{
    id:number;
    productId:number;
    quantity:number;
    expiryDate:string;

    product?:{
      name:string;
    };

  }[];

};



export default function Alerts({

  lowStock,
  emptyStock,
  expiredBatches,
  expiringSoon,
  lowStockProducts,
  expiringProducts,

}:Props){



return (

<div className="rounded-2xl bg-white p-5 shadow">


<h2 className="mb-4 text-xl font-bold">
⚠️ Внимание
</h2>



<div className="space-y-2">


<div className="flex justify-between">
<span>🟠 Заканчиваются товары</span>
<b>{lowStock}</b>
</div>


<div className="flex justify-between">
<span>🔴 Нет в наличии</span>
<b>{emptyStock}</b>
</div>


<div className="flex justify-between">
<span>⛔ Просрочено</span>
<b>{expiredBatches}</b>
</div>


<div className="flex justify-between">
<span>🕒 До 7 дней</span>
<b>{expiringSoon}</b>
</div>


</div>





{lowStockProducts.length > 0 && (

<>

<hr className="my-5"/>


<h3 className="mb-3 font-bold">
📦 Заканчиваются
</h3>



<div className="space-y-3">


{lowStockProducts.map(product=>(


<div
key={product.id}
className="rounded-xl border p-3"
>


<div className="flex justify-between">

<span className="font-semibold">
{product.name}
</span>


<span className="font-bold text-orange-600">
{product.stock} шт
</span>

</div>




<Link

href={`/supplies/new?product=${product.id}`}

className="mt-3 block rounded-lg bg-green-700 py-2 text-center text-white font-semibold"

>

🚚 Создать поставку

</Link>



</div>


))}


</div>


</>

)}





{expiringProducts.length > 0 && (

<>

<hr className="my-5"/>


<h3 className="mb-3 font-bold">
⏰ Скоро срок годности
</h3>



<div className="space-y-3">


{expiringProducts.map(batch=>(


<Link

key={batch.id}

href={`/products/${batch.productId}`}

className="block rounded-xl border p-3"

>


<div className="font-semibold">

{batch.product?.name}

</div>


<div>

Осталось: {batch.quantity} шт

</div>


<div className="text-sm text-gray-500">

До: {new Date(batch.expiryDate)
.toLocaleDateString("ru-RU")}

</div>


</Link>


))}



</div>


</>

)}



</div>

);


}