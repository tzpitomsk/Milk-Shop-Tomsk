import { Prisma } from "@prisma/client";

export async function updateProductStock(
  tx: Prisma.TransactionClient,
  productId: number
) {
  const result = await tx.batch.aggregate({
    where: {
      productId,
    },

    _sum: {
      quantity: true,
    },
  });

  const stock = result._sum.quantity ?? 0;

  await tx.product.update({
    where: {
      id: productId,
    },

    data: {
      stock,
    },
  });

  return stock;
}