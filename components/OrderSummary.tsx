import { Button } from "@/components/ui/button";


type OrderSummaryProps = {
  total:number;
  onSave:()=>void;
};


export default function OrderSummary({
  total,
  onSave,
}:OrderSummaryProps){

return (

<div className="mt-5 rounded-2xl bg-white p-5 shadow">


<div className="flex justify-between text-2xl font-bold">

<span>
Итого
</span>

<span>
{total} ₽
</span>

</div>


<Button
onClick={onSave}
className="mt-5 h-12 w-full rounded-xl bg-green-700 text-white"
>

💾 Сохранить заказ

</Button>


</div>

);

}