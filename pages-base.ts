export function pagesBase(repository?: string): string {
    if (!repository) return '/';
    const [owner, name] = repository.split('/');
    if (!owner || !name) return '/';
    return name.toLowerCase() === `${owner.toLowerCase()}.github.io` ? '/' : `/${name}/`;
}
