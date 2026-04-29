import { withAuth } from "next-auth/middleware"

export default withAuth({
  // Matches the pages config in `[...nextauth]`
  pages: {
    signIn: '/auth/signin',
  },
})

export const config = { matcher: ["/dashboard/:path*", "/api/groups/:path*", "/api/predictions/:path*", "/api/admin/:path*", "/api/matches/:path*", "/api/tournament/:path*", "/api/tournaments/:path*", "/api/profile/:path*", "/api/profile/avatar/:path*"] }
