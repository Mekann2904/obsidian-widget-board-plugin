module.exports = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.tsx?$': '<rootDir>/jest.transform.js',
  },
};
