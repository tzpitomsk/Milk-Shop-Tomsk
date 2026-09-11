import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {

  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.customer.deleteMany();


  await prisma.product.createMany({
    data: [
      {
        name: "Молоко",
        unit: "шт",
        price: 170,
        cost: 100,
        stock: 50,
      },
      {
        name: "Творог",
        unit: "шт",
        price: 250,
        cost: 150,
        stock: 30,
      },
      {
        name: "Сметана",
        unit: "шт",
        price: 120,
        cost: 70,
        stock: 40,
      },
    ],
  });


  await prisma.customer.createMany({
    data: [
      {
        name: "Иван",
        phone: "123456",
        address: "Томск",
      },
    ],
  });


  console.log("✅ Данные добавлены");
}


main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });