import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerSession } from "@/lib/auth-server";
import {
  createAffiliate,
  getAffiliateByEmail,
} from "@/lib/checkout/affiliate-service";
import {
  MAX_AFFILIATE_SOCIAL_PROFILES,
  normalizeAffiliateSocialUrl,
} from "@/lib/checkout/affiliate-social-profiles";
import { sendAffiliateApplicationReceivedEmail } from "@/lib/email/affiliate-emails";

const socialProfileSchema = z.object({
  platform: z.string().trim().min(2, "Enter the social platform name."),
  url: z
    .string()
    .trim()
    .transform((value) => normalizeAffiliateSocialUrl(value))
    .pipe(z.string().url("Enter a valid social profile URL.")),
});

const affiliateSignupSchema = z.object({
  socialProfiles: z
    .array(socialProfileSchema)
    .min(1, "Add at least one social profile.")
    .max(
      MAX_AFFILIATE_SOCIAL_PROFILES,
      `Add up to ${MAX_AFFILIATE_SOCIAL_PROFILES} social profiles.`,
    ),
});

export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Sign in to request Growth Partner access." },
        { status: 401 },
      );
    }

    const payload = affiliateSignupSchema.parse(await request.json());
    const normalizedEmail = session.user.email.toLowerCase();
    const normalizedName =
      session.user.name?.trim() || "Growth Partner Applicant";

    const existingByEmail = await getAffiliateByEmail(normalizedEmail);

    if (existingByEmail) {
      const statusLabel =
        existingByEmail.status.charAt(0).toUpperCase() +
        existingByEmail.status.slice(1);

      return NextResponse.json(
        {
          error:
            existingByEmail.status === "rejected"
              ? "An affiliate application already exists for that email. Contact support to re-open it."
              : `${statusLabel} affiliate access already exists for that email.`,
        },
        { status: 409 },
      );
    }

    const affiliate = await createAffiliate({
      name: normalizedName,
      email: normalizedEmail,
      walletAddress: "",
      socialProfiles: payload.socialProfiles,
      userId: session.user.id,
    });

    try {
      await sendAffiliateApplicationReceivedEmail({
        applicantName: session.user.name,
        applicantEmail: normalizedEmail,
      });
    } catch (error) {
      console.error("[AFFILIATE-SIGNUP-EMAIL]", error);
    }

    return NextResponse.json(
      {
        application: {
          id: affiliate.id,
          email: affiliate.email,
          status: affiliate.status,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "Invalid affiliate application." },
        { status: 400 },
      );
    }

    console.error("[AFFILIATE-SIGNUP]", error);
    return NextResponse.json(
      { error: "Unable to submit your application right now." },
      { status: 500 },
    );
  }
}
