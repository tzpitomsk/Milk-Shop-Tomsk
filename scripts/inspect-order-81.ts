import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
const orderId = 81;

console.log("");
console.log("==============================================================================");
console.log(`ORDER #${orderId} MULTI-BATCH INSPECTION`);
console.log("STRICT READ ONLY");
console.log("==============================================================================");
console.log("");

const order = await prisma.order.findUnique({
where: {
id: orderId,
},
include: {
items: {
include: {
product: true,
batches: {
include: {
batch: {
include: {
product: true,
},
},
},
orderBy: {
id: "asc",
},
},
ReturnBatch: {
include: {
Batch: {
include: {
product: true,
},
},
},
orderBy: {
id: "asc",
},
},
},
orderBy: {
id: "asc",
},
},
},
});

if (!order) {
console.error(`🔴 Order #${orderId} NOT FOUND`);
process.exitCode = 1;
return;
}

console.log(`Order #${order.id}`);
console.log(`Status=${order.status}`);
console.log(`Total=${order.total}`);
console.log(`Profit=${order.profit}`);
console.log(`Date=${order.date.toISOString()}`);
console.log("");

for (const item of order.items) {
console.log("------------------------------------------------------------------------------");
console.log(`OrderItem #${item.id}`);
console.log(`Product #${item.product.id} "${item.product.name}"`);
console.log(`Original quantity=${item.quantity}`);
console.log(`Returned=${item.returned}`);
console.log(`Remaining=${item.quantity - item.returned}`);
console.log(`Sale price=${item.price}`);
console.log("");


console.log("ORDERBATCH RECORDS");
console.log("------------------------------------------------------------------------------");

if (item.batches.length === 0) {
  console.log("🔴 NO OrderBatch records");
} else {
  for (const orderBatch of item.batches) {
    console.log(
      `OrderBatch #${orderBatch.id} | ` +
        `Batch #${orderBatch.batchId} | ` +
        `quantity=${orderBatch.quantity} | ` +
        `purchaseCost=${orderBatch.purchaseCost} | ` +
        `expiry=${orderBatch.batch.expiryDate.toISOString()} | ` +
        `received=${orderBatch.batch.receivedAt.toISOString()} | ` +
        `status=${orderBatch.batch.status} | ` +
        `currentBatchQuantity=${orderBatch.batch.quantity}`
    );
  }
}

console.log("");
console.log("RETURNBATCH RECORDS");
console.log("------------------------------------------------------------------------------");

if (item.ReturnBatch.length === 0) {
  console.log("No ReturnBatch records");
} else {
  for (const returnBatch of item.ReturnBatch) {
    console.log(
      `ReturnBatch #${returnBatch.id} | ` +
        `Batch #${returnBatch.batchId} | ` +
        `quantity=${returnBatch.quantity} | ` +
        `createdAt=${returnBatch.createdAt.toISOString()} | ` +
        `batchExpiry=${returnBatch.Batch.expiryDate.toISOString()} | ` +
        `batchStatus=${returnBatch.Batch.status} | ` +
        `currentBatchQuantity=${returnBatch.Batch.quantity}`
    );
  }
}

console.log("");


}

console.log("==============================================================================");
console.log("PRODUCT / BATCH CURRENT STATE");
console.log("==============================================================================");
console.log("");

const productIds = [...new Set(order.items.map((item) => item.productId))];

for (const productId of productIds) {
const product = await prisma.product.findUnique({
where: {
id: productId,
},
include: {
batches: {
orderBy: {
id: "asc",
},
},
},
});


if (!product) {
  console.log(`🔴 Product #${productId} NOT FOUND`);
  continue;
}

const batchTotal = product.batches.reduce(
  (sum, batch) => sum + batch.quantity,
  0
);

console.log(`Product #${product.id} "${product.name}"`);
console.log(`Product.stock=${product.stock}`);
console.log(`Sum Batch.quantity=${batchTotal}`);
console.log("");

for (const batch of product.batches) {
  if (batch.quantity > 0 || batch.id >= 60) {
    console.log(
      `Batch #${batch.id} | ` +
        `quantity=${batch.quantity} | ` +
        `purchaseCost=${batch.purchaseCost} | ` +
        `expiry=${batch.expiryDate.toISOString()} | ` +
        `received=${batch.receivedAt.toISOString()} | ` +
        `status=${batch.status}`
    );
  }
}

console.log("");

if (product.stock !== batchTotal) {
  console.log(
    `🔴 CRITICAL: Product.stock ${product.stock} != Batch total ${batchTotal}`
  );
} else {
  console.log("🟢 Product.stock matches Batch total");
}

console.log("");


}

console.log("==============================================================================");
console.log("MOVEMENTS FOR ORDER #81");
console.log("==============================================================================");
console.log("");

const movements = await prisma.movement.findMany({
where: {
comment: {
contains: `заказ №${orderId}`,
},
},
orderBy: {
id: "asc",
},
});

if (movements.length === 0) {
console.log("No movements found");
} else {
for (const movement of movements) {
console.log(
`Movement #${movement.id} | ` +
`type=${movement.type} | ` +
`quantity=${movement.quantity} | ` +
`comment="${movement.comment}" | ` +
`createdAt=${movement.createdAt.toISOString()}`
);
}
}

console.log("");
console.log("==============================================================================");
console.log("READ-ONLY INSPECTION COMPLETED");
console.log("NO DATABASE MODIFICATION");
console.log("==============================================================================");
console.log("");
}

main()
.catch((error) => {
console.error("");
console.error("🔴 INSPECTION FAILED");
console.error(error);
process.exitCode = 1;
})
.finally(async () => {
await prisma.$disconnect();
});