// Clerk's default sign-in/sign-up text says "Sign in to {{applicationName}}", where the name comes from
// the Clerk dashboard. Pin our product name here so the cards always read "TC Quoting Estimate".
export const APP_NAME = "TC Quoting Estimate";

const toContinue = `to continue to ${APP_NAME}`;

export const clerkLocalization = {
  signIn: {
    start: {
      title: `Sign in to ${APP_NAME}`,
      titleCombined: `Continue to ${APP_NAME}`,
      subtitle: "Welcome back! Please sign in to continue",
      subtitleCombined: "Welcome back! Please sign in to continue",
    },
    emailCode: { subtitle: toContinue },
    emailLink: { subtitle: toContinue },
    phoneCode: { subtitle: toContinue },
  },
  signUp: {
    start: {
      title: `Create your ${APP_NAME} account`,
      titleCombined: `Create your ${APP_NAME} account`,
      subtitle: "Welcome! Please fill in the details to get started.",
      subtitleCombined: "Welcome! Please fill in the details to get started.",
    },
  },
};
