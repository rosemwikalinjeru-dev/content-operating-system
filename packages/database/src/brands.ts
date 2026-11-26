import { AppError, fromDatabaseError } from "@contentos/shared";
import { normaliseBrand, type BrandProfile, type BrandProfileCreate, type BrandProfileUpdate } from "@contentos/schemas";
import type { UserClient } from "./client";

const COLUMNS =
  "id, name, positioning, audience, voice_profile, brand_guidelines, is_default, status, created_at, updated_at";

interface BrandRow extends Omit<BrandProfile, "audience" | "voice_profile" | "brand_guidelines"> {
  audience: unknown;
  voice_profile: unknown;
  brand_guidelines: unknown;
}

function toBrand(row: BrandRow): BrandProfile {
  return { ...row, ...normaliseBrand(row) };
}

export async function listBrands(db: UserClient): Promise<BrandProfile[]> {
  const { data, error } = await db
    .from("brand_profiles")
    .select(COLUMNS)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw fromDatabaseError(error);
  return (data as BrandRow[]).map(toBrand);
}

export async function getBrand(db: UserClient, id: string): Promise<BrandProfile> {
  const { data, error } = await db.from("brand_profiles").select(COLUMNS).eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Brand not found.");
  return toBrand(data as BrandRow);
}

export async function getDefaultBrand(db: UserClient): Promise<BrandProfile> {
  const { data, error } = await db
    .from("brand_profiles")
    .select(COLUMNS)
    .eq("is_default", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "No default brand configured.");
  return toBrand(data as BrandRow);
}

export async function createBrand(db: UserClient, userId: string, input: BrandProfileCreate): Promise<BrandProfile> {
  const { data, error } = await db
    .from("brand_profiles")
    .insert({ user_id: userId, ...input })
    .select(COLUMNS)
    .single();
  if (error) throw fromDatabaseError(error);
  return toBrand(data as BrandRow);
}

/** Brand changes only arrive through the owner's explicit save in Settings (approval policy). */
export async function updateBrand(db: UserClient, id: string, input: BrandProfileUpdate): Promise<BrandProfile> {
  const { data, error } = await db
    .from("brand_profiles")
    .update(input)
    .eq("id", id)
    .is("deleted_at", null)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Brand not found.");
  return toBrand(data as BrandRow);
}
