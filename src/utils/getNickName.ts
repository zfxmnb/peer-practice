import { uniqueNamesGenerator, animals } from 'unique-names-generator';

const getNickName = () =>
  uniqueNamesGenerator({
    dictionaries: [animals],
  });

export default getNickName;
