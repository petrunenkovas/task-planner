export function pagesBase(repository?: string): string {
    if (repository === undefined || repository === '') {
        return '/';
    }
    const [owner, name] = repository.split('/');
    if (owner === '' || name === undefined || name === '') {
        return '/';
    }
    return name.toLowerCase() === `${owner.toLowerCase()}.github.io` ? '/' : `/${name}/`;
}
