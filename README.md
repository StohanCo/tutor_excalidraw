# Collaborative Whiteboard

A real-time collaborative whiteboard built with Next.js, Excalidraw, and Supabase.

## Features

🎨 **Real-time Collaboration**
- Multiple users can draw simultaneously on the same board
- See other users' cursors and changes in real-time
- User presence indicators with colored avatars

🔗 **Unique Shareable Links**
- Each board has a unique URL (UUID-based)
- Simply share the link for others to join
- Boards are auto-created on first visit

💾 **Persistent Drawings**
- All drawings are automatically saved to Supabase
- New users joining see all previous drawings
- Boards persist until empty for 1 hour

👥 **User Management**
- Users enter their name to join
- Avatar shows first letter of username
- Track who's currently on the board
- Click on avatars to jump to their view

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, install dependencies:

```bash
npm install
# or
yarn install
```

### Environment Setup

Create a `.env.local` file with your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Database Setup

Run the SQL schema in your Supabase project (see `database-schema.sql`):
1. Go to Supabase Dashboard → SQL Editor
2. Copy and paste the contents of `database-schema.sql`
3. Run the query

### Run the Development Server

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## How It Works

1. **Creating a Board**: Visit the homepage, and you'll be redirected to a new board with a unique UUID
2. **Joining a Board**: Enter your name to start collaborating
3. **Sharing**: Click the "Share" button to copy the board URL
4. **Collaborating**: Anyone with the link can join and draw together
5. **Persistence**: All drawings are saved automatically. When you or others return, previous work is loaded

## Board Lifecycle

- **Active**: Board has users actively drawing
- **Idle**: No users, but drawings remain saved
- **Cleanup**: Boards empty for 1+ hour are automatically cleaned up

## Tech Stack

- **Next.js 15** - React framework
- **Excalidraw** - Drawing canvas
- **Supabase** - Backend (PostgreSQL + Realtime)
- **Tailwind CSS** - Styling

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
