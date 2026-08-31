import { badgeGet, BadgeBackendError, type BadgeClassRow } from "@/server/utils/badge_backend";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const { class_id, chain_id } = query;
  if (!class_id || !chain_id) {
    return {
      success: false,
      message: "Invalid request",
      data: [],
    };
  }

  try {
    const result = await badgeGet<{ badge_class: BadgeClassRow }>("/classes/details", {
      class_id: class_id.toString(),
      chain_id: Number(chain_id),
    });
    return {
      success: true,
      message: "Class fetched successfully",
      data: result.badge_class,
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: error instanceof BadgeBackendError ? error.message : "Class not found",
      data: null,
    };
  }
});
