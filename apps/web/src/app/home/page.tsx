import { redirect } from 'next/navigation';

// Superseded by the user app's "My Items". Kept as a redirect for existing links.
export default function HomePage() {
  redirect('/app/items');
}
