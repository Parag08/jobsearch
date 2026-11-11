import { GoogleMark } from "./google-mark";
import styles from "./google-button.module.css";

/**
 * The "Sign in with Google" button, drawn to Google's branding guidelines: white fill,
 * #747775 border, #1F1F1F text and the multicolour G on the left (dark theme: #131314 /
 * #8E918F / #E3E3E3). It is a submit button, so it sits inside a <form> whose action is
 * the signInWith server action.
 */
export function GoogleButton({
  label = "Continue with Google",
  disabled = false,
  wide = false,
}: {
  label?: "Continue with Google" | "Sign in with Google" | "Sign up with Google";
  disabled?: boolean;
  wide?: boolean;
}) {
  return (
    <button type="submit" className={styles.button} data-wide={wide ? "" : undefined} disabled={disabled}>
      <GoogleMark size={18} />
      <span>{label}</span>
    </button>
  );
}
