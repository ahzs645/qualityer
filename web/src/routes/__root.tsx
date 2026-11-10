import { Link, Outlet, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: () => (
    <div className="grid h-full place-items-center p-8 text-center">
      <div>
        <p className="font-medium">That page doesn't exist.</p>
        <Link to="/" className="mt-2 inline-block text-accent underline">Back to projects</Link>
      </div>
    </div>
  ),
})
