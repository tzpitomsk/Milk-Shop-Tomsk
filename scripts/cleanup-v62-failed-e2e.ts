import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
console.log("");
console.log("==============================================================================");
console.log("CLEANUP V62 FAILED RUN");
console.log("==============================================================================");
console.log("");

const productId = 92;
const supplierId = 38;
const supplyId = 86;

console.log(`Удаляем остатки V62: Product #${productId}`);
console.log(`Supplier #${supplierId}`);
console.log(`Supply #${supplyId}`);
console.log("");

await prisma.returnBatch.deleteMany({
where: {
OrderItem: {
productId,
},
},
});

await prisma.orderBatch.deleteMany({
where: {
orderItem: {
productId,
},
},
});

await prisma.orderItem.deleteMany({
where: {
productId,
},
});

await prisma.order.deleteMany({
where: {
items: {
none: {
id: {
not: -1,
},
},
},
},
});

await prisma.supplyItem.deleteMany({
where: {
supplyId,
},
});

await prisma.supply.deleteMany({
where: {
id: supplyId,
},
});

await prisma.movement.deleteMany({
where: {
productId,
},
});

await prisma.batch.deleteMany({
where: {
productId,
},
});

await prisma.product.deleteMany({
where: {
id: productId,
},
});

await prisma.supplier.deleteMany({
where: {
id: supplierId,
},
});

console.log("🟢 FAILED V62 DATA CLEANED");
console.log("");
}

main()
.catch((error) => {
console.error("🔴 CLEANUP FAILED");
console.error(error);
process.exitCode = 1;
})
.finally(async () => {
await prisma.$disconnect();
});
